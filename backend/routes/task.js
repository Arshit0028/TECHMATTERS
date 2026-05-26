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
router.get("/", [auth, can("tasks", "read")], async (req, res) => {
  try {
    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);
    const { project, status, search, assignee } = req.query;

    const filter = {};

    // Non-admins see tasks they created (assigner) OR tasks assigned to them
    if (!isAdmin) {
      filter.$or = [{ assignee: req.user.id }, { assigner: req.user.id }];
    }

    // ── Explicit assignee filter (used by the monthly report) ──
    // When an assignee is requested, scope strictly to that assignee so the
    // report's task list matches exactly who the tasks belong to.
    if (assignee) {
      filter.assignee = assignee;
      // For a non-admin, drop the broad $or so the assignee filter is exact.
      if (!isAdmin) delete filter.$or;
    }

    if (project) filter.project = project;
    if (status) filter.status = status;
    if (search) {
      filter.$text = { $search: search };
    }

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
