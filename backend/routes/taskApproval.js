const express = require("express");
const router = express.Router();
const Task = require("../models/Task");

// ─── Resolve auth middleware — matches how task.js imports it ─────────────────
// task.js does: const auth = require("../middleware/auth");
// and uses it directly as [auth, ...], so auth IS the function itself.
const auth = require("../middleware/auth");
const verifyToken =
  typeof auth === "function"
    ? auth
    : (() => {
        const keys = [
          "verifyToken",
          "auth",
          "protect",
          "authenticate",
          "authMiddleware",
          "middleware",
          "default",
        ];
        for (const k of keys) {
          if (typeof auth[k] === "function") return auth[k];
        }
        throw new Error(
          "[taskApproval] Cannot resolve auth. Keys: " +
            Object.keys(auth || {}).join(", "),
        );
      })();

// ─── GET /api/tasks/pending-approval ─────────────────────────────────────────
// Manager sees all tasks waiting for their sign-off.
router.get("/pending-approval", verifyToken, async (req, res) => {
  try {
    const role = req.user?.role || req.user?.accessLevel;
    if (role !== "admin" && role !== "super-admin" && role !== "manager") {
      return res
        .status(403)
        .json({
          message: "Only managers or admins can view the approval queue",
        });
    }

    const tasks = await Task.find({ approvalStatus: "pending" })
      .populate("assignee", "name email accessLevel") // ← your model's field
      .populate("assigner", "name email accessLevel") // ← your model's field
      .populate("assignedBy", "name email") // new approval field
      .populate("project", "name")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error("[taskApproval] pending-approval:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/tasks/assigned-to-me ───────────────────────────────────────────
// Tasks where the current user is the RECIPIENT (assignee field).
// Includes tasks that pre-date the approval system (no approvalStatus).
router.get("/assigned-to-me", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const tasks = await Task.find({
      assignee: userId, // ← your model uses `assignee`
      $or: [
        { approvalStatus: { $in: ["approved", "not_required"] } },
        { approvalStatus: { $exists: false } }, // pre-approval legacy tasks
        { approvalStatus: null },
      ],
    })
      .populate("assignee", "name email")
      .populate("assigner", "name email") // ← who created it
      .populate("project", "name")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error("[taskApproval] assigned-to-me:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/tasks/assigned-by-me ───────────────────────────────────────────
// Tasks the current user created and assigned to someone ELSE.
// Uses your model's existing `assigner` field (set on every task creation).
router.get("/assigned-by-me", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const tasks = await Task.find({
      assigner: userId, // I created it
      assignee: { $exists: true, $ne: null }, // it has an assignee
    })
      .populate("assignee", "name email")
      .populate("assigner", "name email")
      .populate("project", "name")
      .sort({ createdAt: -1 });

    // Exclude tasks assigned to myself (self-assigned)
    const filtered = tasks.filter(
      (t) => t.assignee && t.assignee._id?.toString() !== userId?.toString(),
    );

    res.json(filtered);
  } catch (err) {
    console.error("[taskApproval] assigned-by-me:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/tasks/all-my-tasks ─────────────────────────────────────────────
// Single combined endpoint — returns { received, outgoing } in one call.
router.get("/all-my-tasks", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const [receivedRaw, outgoingRaw] = await Promise.all([
      // Tasks assigned TO me (approved or legacy)
      Task.find({
        assignee: userId,
        $or: [
          { approvalStatus: { $in: ["approved", "not_required"] } },
          { approvalStatus: { $exists: false } },
          { approvalStatus: null },
        ],
      })
        .populate("assignee", "name email")
        .populate("assigner", "name email")
        .populate("project", "name")
        .sort({ createdAt: -1 }),

      // Tasks I created and assigned to someone else
      Task.find({
        assigner: userId,
        assignee: { $exists: true, $ne: null },
      })
        .populate("assignee", "name email")
        .populate("assigner", "name email")
        .populate("project", "name")
        .sort({ createdAt: -1 }),
    ]);

    const received = receivedRaw.map((t) => ({
      ...t.toObject(),
      _direction: "received",
    }));

    // Exclude self-assigned from outgoing
    const outgoing = outgoingRaw
      .filter(
        (t) => t.assignee && t.assignee._id?.toString() !== userId?.toString(),
      )
      .map((t) => ({ ...t.toObject(), _direction: "outgoing" }));

    // Deduplicate across both lists
    const seen = new Set();
    const all = [...received, ...outgoing].filter((t) => {
      const id = t._id.toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    res.json({ received, outgoing, all });
  } catch (err) {
    console.error("[taskApproval] all-my-tasks:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/tasks/:id/approve ────────────────────────────────────────────
router.patch("/:id/approve", verifyToken, async (req, res) => {
  try {
    const role = req.user?.role || req.user?.accessLevel;
    if (role !== "admin" && role !== "super-admin" && role !== "manager") {
      return res
        .status(403)
        .json({ message: "Only managers or admins can approve tasks" });
    }

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.approvalStatus !== "pending") {
      return res
        .status(400)
        .json({ message: "Task is not in a pending state" });
    }

    task.approvalStatus = "approved";
    task.approvedBy = req.user?.id || req.user?._id;
    task.approvedAt = new Date();
    task.approvalNote = (req.body.note || "").trim();
    await task.save();

    const updated = await Task.findById(task._id)
      .populate("assignee", "name email")
      .populate("assigner", "name email")
      .populate("approvedBy", "name email")
      .populate("project", "name");

    res.json(updated);
  } catch (err) {
    console.error("[taskApproval] approve:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/tasks/:id/reject ─────────────────────────────────────────────
router.patch("/:id/reject", verifyToken, async (req, res) => {
  try {
    const role = req.user?.role || req.user?.accessLevel;
    if (role !== "admin" && role !== "super-admin" && role !== "manager") {
      return res
        .status(403)
        .json({ message: "Only managers or admins can reject tasks" });
    }

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.approvalStatus !== "pending") {
      return res
        .status(400)
        .json({ message: "Task is not in a pending state" });
    }

    task.approvalStatus = "rejected";
    task.approvalNote = (req.body.note || "").trim();
    await task.save();

    const updated = await Task.findById(task._id)
      .populate("assignee", "name email")
      .populate("assigner", "name email")
      .populate("project", "name");

    res.json(updated);
  } catch (err) {
    console.error("[taskApproval] reject:", err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
