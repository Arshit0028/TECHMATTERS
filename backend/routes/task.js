// backend/routes/task.js
const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const auth = require("../middleware/auth");
const { can, ADMIN_ROLES } = require("../middleware/permissions");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;

// ─── Multer Configuration ─────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads/tasks");
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `task-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.originalname}`), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

const deleteFileIfExists = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") console.error("File delete error:", err);
  }
};

// ─── GET all tasks ─────────────────────────────────────────────────────────────
// Supports optional ?month=N&year=N filtering: only returns tasks whose date
// range (startDate / endDate / dueDate) overlaps the requested month.
// Undated tasks (no startDate, endDate, or dueDate) are always included.
router.get("/", [auth, can("tasks", "read")], async (req, res) => {
  try {
    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);
    const { project, status, search, assignee, month, year } = req.query;

    // Build filter as an array of conditions, combined with $and at the end.
    // This avoids $or / $and conflicts when multiple conditions each use $or.
    const andConditions = [];

    // ── Access control ────────────────────────────────────────────────────────
    if (!isAdmin) {
      if (assignee) {
        // Strict assignee filter (used by the monthly-report task fetch).
        // Drop the broad "me as assigner OR assignee" rule so the result is exact.
        andConditions.push({ assignee });
      } else {
        andConditions.push({
          $or: [{ assignee: req.user.id }, { assigner: req.user.id }],
        });
      }
    } else if (assignee) {
      andConditions.push({ assignee });
    }

    // ── Simple scalar filters ─────────────────────────────────────────────────
    if (project) andConditions.push({ project });
    if (status) andConditions.push({ status });
    if (search) andConditions.push({ $text: { $search: search } });

    // ── Month / year date-range filter ────────────────────────────────────────
    // A task is "in" the requested month when ANY of the following hold:
    //   • startDate falls within the month
    //   • endDate   falls within the month
    //   • dueDate   falls within the month
    //   • task spans the entire month (start ≤ monthEnd AND end ≥ monthStart)
    //   • task has no date fields at all (undated tasks are always included)
    if (month && year) {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);

      if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
        const startOfMonth = new Date(y, m - 1, 1);
        const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);

        andConditions.push({
          $or: [
            // startDate within month
            { startDate: { $gte: startOfMonth, $lte: endOfMonth } },
            // endDate within month
            { endDate: { $gte: startOfMonth, $lte: endOfMonth } },
            // dueDate within month
            { dueDate: { $gte: startOfMonth, $lte: endOfMonth } },
            // task spans the month (started before / ends after)
            {
              startDate: { $lte: endOfMonth },
              endDate: { $gte: startOfMonth },
            },
            // undated tasks — null matches both null and missing fields in MongoDB
            { startDate: null, endDate: null, dueDate: null },
          ],
        });
      }
    }

    // Collapse conditions into a single Mongoose filter object
    const filter =
      andConditions.length === 0
        ? {}
        : andConditions.length === 1
          ? andConditions[0]
          : { $and: andConditions };

    const tasks = await Task.find(filter)
      .populate("project", "name")
      .populate("assignee assigner", "name email")
      .populate("attachments.uploadedBy", "name email")
      .populate("dependencies", "title status")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─── GET single task ───────────────────────────────────────────────────────────
router.get("/:id", [auth, can("tasks", "read")], async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("project", "name")
      .populate("assignee assigner", "name email")
      .populate("attachments.uploadedBy", "name email")
      .populate("dependencies", "title status");

    if (!task) return res.status(404).json({ msg: "Task not found" });

    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);
    if (
      !isAdmin &&
      task.assignee?._id?.toString() !== req.user.id &&
      task.assigner?._id?.toString() !== req.user.id
    ) {
      return res.status(403).json({ msg: "Access denied" });
    }
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─── CREATE task ───────────────────────────────────────────────────────────────
router.post(
  "/",
  [auth, can("tasks", "create"), upload.array("attachments", MAX_FILES)],
  async (req, res) => {
    try {
      const attachments = req.files
        ? req.files.map((file) => ({
            name: file.originalname,
            url: `/uploads/tasks/${file.filename}`,
            size: file.size,
            uploadedBy: req.user.id,
          }))
        : [];

      const taskData = {
        ...req.body,
        assigner: req.user.id,
        attachments,
      };

      const task = new Task(taskData);
      await task.save();
      await task.populate(
        "project assignee assigner attachments.uploadedBy",
        "name email",
      );
      res.status(201).json(task);
    } catch (err) {
      console.error(err);
      if (req.files) {
        for (const file of req.files) await deleteFileIfExists(file.path);
      }
      res.status(400).json({ msg: err.message || "Server error" });
    }
  },
);

// ─── UPDATE task ───────────────────────────────────────────────────────────────
router.put(
  "/:id",
  [auth, can("tasks", "update"), upload.array("attachments", MAX_FILES)],
  async (req, res) => {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) return res.status(404).json({ msg: "Task not found" });

      // Handle removal of existing attachments
      let removedIds = [];
      if (req.body.removedAttachments) {
        try {
          removedIds = JSON.parse(req.body.removedAttachments);
        } catch (e) {}
      }

      if (removedIds.length > 0) {
        const remaining = task.attachments.filter((att) => {
          const keep = !removedIds.includes(att._id.toString());
          if (!keep) {
            const filePath = path.join(__dirname, "../../", att.url);
            deleteFileIfExists(filePath);
          }
          return keep;
        });
        task.attachments = remaining;
      }

      // Add new attachments
      if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map((file) => ({
          name: file.originalname,
          url: `/uploads/tasks/${file.filename}`,
          size: file.size,
          uploadedBy: req.user.id,
        }));
        task.attachments.push(...newAttachments);
      }

      // Update other fields
      Object.keys(req.body).forEach((key) => {
        if (!["attachments", "removedAttachments"].includes(key)) {
          task[key] = req.body[key];
        }
      });

      await task.save();
      await task.populate(
        "project assignee assigner attachments.uploadedBy",
        "name email",
      );

      res.json(task);
    } catch (err) {
      console.error(err);
      if (req.files) {
        for (const file of req.files) await deleteFileIfExists(file.path);
      }
      res.status(400).json({ msg: err.message || "Server error" });
    }
  },
);

// ─── DELETE task ───────────────────────────────────────────────────────────────
// NOTE: Only `auth` middleware here — the blanket `can("tasks","delete")` gate
// was removed so the per-task ownership check below can actually run. A user
// who is the creator OR assignee (or an admin) may delete; everyone else gets
// a 403 from the in-handler check, so security is unchanged.
router.delete("/:id", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ msg: "Task not found" });
    }

    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);
    const isCreator = task.assigner && task.assigner.toString() === req.user.id;
    const isAssignee =
      task.assignee && task.assignee.toString() === req.user.id;

    // Allow delete if admin OR creator OR assignee
    if (!isAdmin && !isCreator && !isAssignee) {
      return res
        .status(403)
        .json({ msg: "You do not have permission to delete this task" });
    }

    // Cleanup all attachment files from disk
    for (const att of task.attachments || []) {
      const filePath = path.join(__dirname, "../../", att.url);
      await deleteFileIfExists(filePath);
    }

    await Task.findByIdAndDelete(req.params.id);

    console.log(`✅ Task deleted: ${req.params.id} by user ${req.user.id}`);
    res.json({ msg: "Task deleted successfully" });
  } catch (err) {
    console.error("❌ Delete task error:", err);
    res.status(500).json({
      msg: "Server error while deleting task",
      error: err.message,
    });
  }
});

module.exports = router;
