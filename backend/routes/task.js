const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const auth = require("../middleware/auth");
const { can, ADMIN_ROLES } = require("../middleware/permissions");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;

// ─── Multer (unchanged) ───────────────────────────────────────────────────────
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
const MAX_FILE_SIZE = 10 * 1024 * 1024;
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
  ALLOWED_MIME_TYPES.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error(`Invalid file type: ${file.originalname}`), false);
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
// Non-admins: only see tasks THEY created (assigner === me).
// Admins:     see all tasks, optionally filtered by `assigner` query param.
//             The query param is called `assignee` for backward-compat with
//             existing monthly-report calls — we map it to `assigner` here.
router.get("/", [auth, can("tasks", "read")], async (req, res) => {
  try {
    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);

    // Support both ?assigner=id and legacy ?assignee=id from monthly-report
    const { project, status, search, assignee, assigner, month, year } =
      req.query;
    const ownerFilter = assigner || assignee; // whichever is provided

    const andConditions = [];

    if (!isAdmin) {
      // Employees only see their own tasks
      andConditions.push({ assigner: req.user.id });
    } else if (ownerFilter) {
      // Admin filters by a specific employee's tasks
      andConditions.push({ assigner: ownerFilter });
    }

    if (project) andConditions.push({ project });
    if (status) andConditions.push({ status });
    if (search) andConditions.push({ $text: { $search: search } });

    if (month && year) {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);
      if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
        const startOfMonth = new Date(y, m - 1, 1);
        const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
        andConditions.push({
          $or: [
            { startDate: { $gte: startOfMonth, $lte: endOfMonth } },
            { endDate: { $gte: startOfMonth, $lte: endOfMonth } },
            { dueDate: { $gte: startOfMonth, $lte: endOfMonth } },
            {
              startDate: { $lte: endOfMonth },
              endDate: { $gte: startOfMonth },
            },
            { startDate: null, endDate: null, dueDate: null },
          ],
        });
      }
    }

    const filter =
      andConditions.length === 0
        ? {}
        : andConditions.length === 1
          ? andConditions[0]
          : { $and: andConditions };

    const tasks = await Task.find(filter)
      .populate("project", "name")
      .populate("assigner", "name email")
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
      .populate("assigner", "name email")
      .populate("attachments.uploadedBy", "name email")
      .populate("dependencies", "title status");

    if (!task) return res.status(404).json({ msg: "Task not found" });

    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);
    const isCreator = task.assigner?._id?.toString() === req.user.id;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ msg: "Access denied" });
    }
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─── CREATE task ───────────────────────────────────────────────────────────────
// assigner is always set to the logged-in user.
// No assignee — employee creates a task for themselves only.
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

      // Strip assignee even if client accidentally sends it
      const { assignee: _removed, ...bodyWithoutAssignee } = req.body;

      const task = new Task({
        ...bodyWithoutAssignee,
        assigner: req.user.id,
        attachments,
      });

      await task.save();
      await task.populate(
        "project assigner attachments.uploadedBy",
        "name email",
      );
      res.status(201).json(task);
    } catch (err) {
      console.error(err);
      if (req.files)
        for (const f of req.files) await deleteFileIfExists(f.path);
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

      let removedIds = [];
      if (req.body.removedAttachments) {
        try {
          removedIds = JSON.parse(req.body.removedAttachments);
        } catch (e) {}
      }

      if (removedIds.length > 0) {
        task.attachments = task.attachments.filter((att) => {
          const keep = !removedIds.includes(att._id.toString());
          if (!keep)
            deleteFileIfExists(path.join(__dirname, "../../", att.url));
          return keep;
        });
      }

      if (req.files?.length) {
        task.attachments.push(
          ...req.files.map((f) => ({
            name: f.originalname,
            url: `/uploads/tasks/${f.filename}`,
            size: f.size,
            uploadedBy: req.user.id,
          })),
        );
      }

      Object.keys(req.body).forEach((key) => {
        // Never allow reassigning the creator or mutating attachments via body
        if (
          ![
            "attachments",
            "removedAttachments",
            "assigner",
            "assignee",
          ].includes(key)
        ) {
          task[key] = req.body[key];
        }
      });

      await task.save();
      await task.populate(
        "project assigner attachments.uploadedBy",
        "name email",
      );
      res.json(task);
    } catch (err) {
      console.error(err);
      if (req.files)
        for (const f of req.files) await deleteFileIfExists(f.path);
      res.status(400).json({ msg: err.message || "Server error" });
    }
  },
);

// ─── DELETE task ───────────────────────────────────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: "Task not found" });

    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);
    const isCreator = task.assigner?.toString() === req.user.id;

    if (!isAdmin && !isCreator) {
      return res
        .status(403)
        .json({ msg: "You do not have permission to delete this task" });
    }

    for (const att of task.attachments || []) {
      await deleteFileIfExists(path.join(__dirname, "../../", att.url));
    }

    await Task.findByIdAndDelete(req.params.id);
    console.log(`✅ Task deleted: ${req.params.id} by user ${req.user.id}`);
    res.json({ msg: "Task deleted successfully" });
  } catch (err) {
    console.error("❌ Delete task error:", err);
    res
      .status(500)
      .json({ msg: "Server error while deleting task", error: err.message });
  }
});

module.exports = router;
