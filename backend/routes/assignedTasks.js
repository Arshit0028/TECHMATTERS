const express = require("express");
const router = express.Router();
const AssignedTask = require("../models/AssignedTask");

// ── Auth: mirrors exactly how task.js imports it ──────────────────────────────
const auth = require("../middleware/auth");

// ── Permissions helper ────────────────────────────────────────────────────────
const { ADMIN_ROLES } = require("../middleware/permissions");
const canApprove = (accessLevel) =>
  ADMIN_ROLES.includes(accessLevel) || accessLevel === "manager";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assigned-tasks
// Employee creates a peer assignment → always starts as 'pending'
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  try {
    const { title, description, project, assignee, priority, dueDate } =
      req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ msg: "Title is required" });
    }
    if (!project) {
      return res.status(400).json({ msg: "Project is required" });
    }
    if (!assignee) {
      return res.status(400).json({ msg: "Assignee is required" });
    }
    if (assignee.toString() === req.user.id.toString()) {
      return res
        .status(400)
        .json({ msg: "You cannot assign a task to yourself" });
    }

    const task = new AssignedTask({
      title: title.trim(),
      description: description ? description.trim() : "",
      project,
      assignee,
      assigner: req.user.id,
      priority: priority || "Medium",
      dueDate: dueDate || null,
      approvalStatus: "pending",
    });

    await task.save();

    const populated = await AssignedTask.findById(task._id)
      .populate("project", "name")
      .populate("assignee", "name email")
      .populate("assigner", "name email");

    res.status(201).json(populated);
  } catch (err) {
    console.error("[assignedTasks] POST /:", err.message);
    res.status(400).json({ msg: err.message || "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assigned-tasks/pending-approval
// Manager sees all tasks waiting for sign-off
// ─────────────────────────────────────────────────────────────────────────────
router.get("/pending-approval", auth, async (req, res) => {
  try {
    if (!canApprove(req.user.accessLevel)) {
      return res
        .status(403)
        .json({ msg: "Only managers or admins can view the approval queue" });
    }

    const tasks = await AssignedTask.find({ approvalStatus: "pending" })
      .populate("assigner", "name email")
      .populate("assignee", "name email")
      .populate("project", "name")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error("[assignedTasks] GET /pending-approval:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assigned-tasks/mine
// Tasks assigned TO me that a manager approved
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mine", auth, async (req, res) => {
  try {
    const tasks = await AssignedTask.find({
      assignee: req.user.id,
      approvalStatus: "approved",
    })
      .populate("assigner", "name email")
      .populate("project", "name")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error("[assignedTasks] GET /mine:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assigned-tasks/by-me
// Tasks I assigned to others (all approval states so I can track them)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/by-me", auth, async (req, res) => {
  try {
    const tasks = await AssignedTask.find({ assigner: req.user.id })
      .populate("assignee", "name email")
      .populate("project", "name")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error("[assignedTasks] GET /by-me:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assigned-tasks/all
// Combined: { received, outgoing } in one network call
// ─────────────────────────────────────────────────────────────────────────────
router.get("/all", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [received, outgoing] = await Promise.all([
      AssignedTask.find({ assignee: userId, approvalStatus: "approved" })
        .populate("assigner", "name email")
        .populate("project", "name")
        .sort({ createdAt: -1 }),

      AssignedTask.find({ assigner: userId })
        .populate("assignee", "name email")
        .populate("project", "name")
        .sort({ createdAt: -1 }),
    ]);

    res.json({ received, outgoing });
  } catch (err) {
    console.error("[assignedTasks] GET /all:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/assigned-tasks/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/approve", auth, async (req, res) => {
  try {
    if (!canApprove(req.user.accessLevel)) {
      return res
        .status(403)
        .json({ msg: "Only managers or admins can approve tasks" });
    }

    const task = await AssignedTask.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: "Task not found" });
    if (task.approvalStatus !== "pending") {
      return res.status(400).json({ msg: "Task is not in pending state" });
    }

    task.approvalStatus = "approved";
    task.approvedBy = req.user.id;
    task.approvedAt = new Date();
    task.approvalNote = (req.body.note || "").trim();
    await task.save();

    const updated = await AssignedTask.findById(task._id)
      .populate("assigner", "name email")
      .populate("assignee", "name email")
      .populate("approvedBy", "name email")
      .populate("project", "name");

    res.json(updated);
  } catch (err) {
    console.error("[assignedTasks] PATCH /approve:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/assigned-tasks/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/reject", auth, async (req, res) => {
  try {
    if (!canApprove(req.user.accessLevel)) {
      return res
        .status(403)
        .json({ msg: "Only managers or admins can reject tasks" });
    }

    const task = await AssignedTask.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: "Task not found" });
    if (task.approvalStatus !== "pending") {
      return res.status(400).json({ msg: "Task is not in pending state" });
    }

    task.approvalStatus = "rejected";
    task.approvalNote = (req.body.note || "").trim();
    await task.save();

    const updated = await AssignedTask.findById(task._id)
      .populate("assigner", "name email")
      .populate("assignee", "name email")
      .populate("project", "name");

    res.json(updated);
  } catch (err) {
    console.error("[assignedTasks] PATCH /reject:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/assigned-tasks/:id
// Assignee updates status (In Progress / Done)
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id", auth, async (req, res) => {
  try {
    const task = await AssignedTask.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: "Task not found" });

    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);
    const isAssignee = task.assignee.toString() === req.user.id.toString();
    const isAssigner = task.assigner.toString() === req.user.id.toString();

    if (!isAdmin && !isAssignee && !isAssigner) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    if (req.body.status) task.status = req.body.status;

    await task.save();

    const updated = await AssignedTask.findById(task._id)
      .populate("assigner", "name email")
      .populate("assignee", "name email")
      .populate("project", "name");

    res.json(updated);
  } catch (err) {
    console.error("[assignedTasks] PATCH /:id:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
