// routes/activities.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");

const Activity = require("../models/Activity");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const { ADMIN_ROLES } = require("../middleware/permissions");
const { getLocalDateParts } = require("../utils/dateHelpers");

// Roles that can READ ALL activities (read-only for HR).
const READ_ALL_ROLES = [...ADMIN_ROLES, "hr"];

// Statuses that lock an activity from further edits once reached.
// Delete is intentionally NOT restricted here per product decision —
// only editing is blocked.
const LOCKED_STATUSES = ["Submitted", "Completed"];

// ── Multer setup for attachments ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/activities/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// ── Helpers ────────────────────────────────────────────────────────────
// Parses the reminderDays field sent from the form (JSON-stringified array,
// e.g. '["Mon","Wed"]'). Always returns an array, never throws.
function parseReminderDays(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Best-effort: failure to create a notification should never fail the
// activity create/update request itself.
async function notifyActivityCreated(activity) {
  try {
    await Notification.create({
      recipient: activity.assignee,
      activity: activity._id,
      type: "activity_created",
      title: `New ${activity.activityType.toLowerCase()} activity created`,
      message: `"${activity.name}" has been added to your activities.`,
      dateKey: getLocalDateParts().dateKey,
    });
  } catch (err) {
    console.error("Failed to create activity_created notification:", err);
  }
}

// ── Create Activity ──────────────────────────────────────────────────
router.post("/", auth, upload.array("attachments", 10), async (req, res) => {
  try {
    const {
      name,
      description,
      startDate,
      endDate,
      activityType,
      priority,
      status,
      reminderDays,
    } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ msg: "Name is required" });
    }

    const resolvedType = activityType || "One Time";
    // Daily activities are date-less by design — strip any stray values
    // even if the client somehow sends them.
    const isDaily = resolvedType === "Daily";

    const activity = new Activity({
      name: name.trim(),
      description: description || "",
      assignee: req.user.id,
      startDate: isDaily ? null : startDate || null,
      endDate: isDaily ? null : endDate || null,
      activityType: resolvedType,
      priority: priority || "Medium",
      status: status || "Pending",
      reminderDays:
        resolvedType === "Weekly" ? parseReminderDays(reminderDays) : [],
    });

    if (req.files && req.files.length > 0) {
      activity.attachments = req.files.map((file) => ({
        name: file.originalname,
        url: `/uploads/activities/${file.filename}`,
        uploadedBy: req.user.id,
      }));
    }

    await activity.save();
    await notifyActivityCreated(activity);

    const populated = await Activity.findById(activity._id)
      .populate("assignee", "name")
      .populate("task", "title");

    res.status(201).json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Update Activity ──────────────────────────────────────────────────
router.put("/:id", auth, upload.array("attachments", 10), async (req, res) => {
  try {
    const {
      name,
      description,
      startDate,
      endDate,
      activityType,
      priority,
      status,
      reminderDays,
    } = req.body;

    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ msg: "Activity not found" });

    // Only owner can edit (admins/HR remain read-only here).
    if (activity.assignee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    // Once Submitted or Completed, the activity is locked from further
    // edits — server-side enforcement mirrors the frontend lock so the
    // restriction can't be bypassed via direct API calls. The one
    // exception: a status transition INTO "Submitted" or "Completed" is
    // still allowed (e.g. the Mark Completed / Submit action itself),
    // since that's the action that locks it, not an edit after the fact.
    const isAlreadyLocked = LOCKED_STATUSES.includes(activity.status);
    const isOnlyStatusChange =
      status !== undefined &&
      name === undefined &&
      description === undefined &&
      startDate === undefined &&
      endDate === undefined &&
      activityType === undefined &&
      priority === undefined &&
      reminderDays === undefined &&
      (!req.files || req.files.length === 0);

    if (isAlreadyLocked && !isOnlyStatusChange) {
      return res.status(403).json({
        msg: "This activity is locked and can no longer be edited.",
      });
    }

    if (name) activity.name = name.trim();
    if (description !== undefined) activity.description = description;
    if (startDate !== undefined) activity.startDate = startDate || null;
    if (endDate !== undefined) activity.endDate = endDate || null;
    if (activityType) activity.activityType = activityType;
    if (priority) activity.priority = priority;
    if (status) activity.status = status;

    if (reminderDays !== undefined) {
      activity.reminderDays =
        activity.activityType === "Weekly"
          ? parseReminderDays(reminderDays)
          : [];
    }

    // Daily activities are date-less by design — enforced here too in case
    // type was just switched to Daily on this same edit.
    if (activity.activityType === "Daily") {
      activity.startDate = null;
      activity.endDate = null;
    }
    if (activity.activityType !== "Weekly") {
      activity.reminderDays = [];
    }

    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map((file) => ({
        name: file.originalname,
        url: `/uploads/activities/${file.filename}`,
        uploadedBy: req.user.id,
      }));
      activity.attachments.push(...newAttachments);
    }

    await activity.save();

    const updated = await Activity.findById(activity._id)
      .populate("assignee", "name")
      .populate("task", "title");

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Delete Activity ───────────────────────────────────────────────────
// No status restriction on delete per product decision — owner can delete
// an activity at any status, including Submitted/Completed.
router.delete("/:id", auth, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ msg: "Activity not found" });

    if (activity.assignee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    await activity.deleteOne();
    res.json({ msg: "Activity deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Get all activities (for list) ────────────────────────────────────
// Read-all roles (admins, HR): see everyone's activities, optionally scoped to
//   a single employee via ?assignee=<userId> (used by Employee Reports).
// Everyone else: only their own activities.
// Optional ?month=YYYY-MM filters activities whose startDate (or endDate,
// for ranges spanning the month) falls within that month.
router.get("/", auth, async (req, res) => {
  try {
    const isReadAll = READ_ALL_ROLES.includes(req.user.accessLevel);
    const { assignee, month } = req.query;

    const filter = {};
    if (!isReadAll) {
      filter.assignee = req.user.id;
    } else if (assignee && mongoose.Types.ObjectId.isValid(assignee)) {
      filter.assignee = assignee;
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, mon] = month.split("-").map(Number);
      const monthStart = new Date(year, mon - 1, 1, 0, 0, 0, 0);
      const monthEnd = new Date(year, mon, 0, 23, 59, 59, 999);

      filter.$or = [
        { startDate: { $gte: monthStart, $lte: monthEnd } },
        { endDate: { $gte: monthStart, $lte: monthEnd } },
        {
          startDate: { $lte: monthStart },
          endDate: { $gte: monthEnd },
        },
      ];
    }

    const activities = await Activity.find(filter)
      .populate("assignee", "name")
      .populate("task", "title")
      .sort({ createdAt: -1 });

    res.json(activities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Get single activity ──────────────────────────────────────────────
router.get("/:id", auth, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id)
      .populate("assignee", "name")
      .populate("task", "title");
    if (!activity) return res.status(404).json({ msg: "Activity not found" });
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
