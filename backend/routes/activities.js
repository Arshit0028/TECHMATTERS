// routes/activities.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");

const Activity = require("../models/Activity");
const RecurringOccurrence = require("../models/RecurringOccurrence");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const { ADMIN_ROLES } = require("../middleware/permissions");
const { getLocalDateParts } = require("../utils/dateHelpers");

const READ_ALL_ROLES = [...ADMIN_ROLES, "hr"];
const LOCKED_STATUSES = ["Submitted", "Completed"];

// ── Multer (unchanged) ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/activities/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ── Helpers ────────────────────────────────────────────────────────────
function parseReminderDays(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

// ── Recurring helpers ──────────────────────────────────────────────────
const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const toDateOnly = (d) => {
  const dt = new Date(d);
  return new Date(
    Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()),
  );
};

const todayUTC = () => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
};

function generateOccurrenceDates(startDate, endDate, weekdays) {
  const days = new Set(weekdays.map((d) => WEEKDAY_MAP[d]));
  const dates = [];
  const cur = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  while (cur <= end) {
    if (days.has(cur.getUTCDay())) dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// Annotates raw occurrence docs with computed displayStatus:
//   "completed" — marked done
//   "late"      — past due, not completed (still completable)
//   "pending"   — today or future
function annotateOccurrences(occurrences) {
  const today = todayUTC();
  return occurrences.map((occ) => {
    const obj =
      typeof occ.toObject === "function" ? occ.toObject() : { ...occ };
    if (obj.status === "completed") {
      obj.displayStatus = "completed";
    } else if (new Date(obj.scheduledDate) < today) {
      obj.displayStatus = "late";
    } else {
      obj.displayStatus = "pending";
    }
    return obj;
  });
}

// Fetches live stats for a recurring activity from the occurrence collection.
async function getRecurringStats(activityId, totalOccurrences) {
  const today = todayUTC();
  const occs = await RecurringOccurrence.find({
    recurringActivity: activityId,
  });
  const completed = occs.filter((o) => o.status === "completed").length;
  const late = occs.filter(
    (o) => o.status === "pending" && new Date(o.scheduledDate) < today,
  ).length;
  const pending = occs.filter(
    (o) => o.status === "pending" && new Date(o.scheduledDate) >= today,
  ).length;
  return { total: totalOccurrences, completed, late, pending };
}

// ── CREATE Activity ────────────────────────────────────────────────────
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
      // Recurring fields
      isRecurring,
      weekdays,
    } = req.body;

    if (!name || name.trim() === "")
      return res.status(400).json({ msg: "Name is required" });

    const resolvedType = activityType || "One Time";
    const isDaily = resolvedType === "Daily";
    const recurring = isRecurring === "true" || isRecurring === true;

    // Validate recurring-specific fields
    if (recurring) {
      const days =
        typeof weekdays === "string" ? JSON.parse(weekdays) : weekdays || [];
      if (!Array.isArray(days) || days.length === 0)
        return res
          .status(400)
          .json({
            msg: "At least one weekday is required for recurring activities",
          });
      if (!startDate || !endDate)
        return res
          .status(400)
          .json({
            msg: "Start and end date are required for recurring activities",
          });
    }

    const parsedWeekdays = recurring
      ? typeof weekdays === "string"
        ? JSON.parse(weekdays)
        : weekdays || []
      : [];

    // Calculate total occurrences up front so we can store it
    let totalOccurrences = 0;
    if (recurring && startDate && endDate && parsedWeekdays.length > 0) {
      totalOccurrences = generateOccurrenceDates(
        startDate,
        endDate,
        parsedWeekdays,
      ).length;
      if (totalOccurrences === 0)
        return res
          .status(400)
          .json({
            msg: "No occurrences fall within the date range for the selected weekdays",
          });
    }

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
      // Recurring fields
      isRecurring: recurring,
      weekdays: parsedWeekdays,
      totalOccurrences,
    });

    if (req.files && req.files.length > 0) {
      activity.attachments = req.files.map((file) => ({
        name: file.originalname,
        url: `/uploads/activities/${file.filename}`,
        uploadedBy: req.user.id,
      }));
    }

    await activity.save();

    // Generate occurrence records for recurring activities
    if (recurring && totalOccurrences > 0) {
      const dates = generateOccurrenceDates(startDate, endDate, parsedWeekdays);
      const occurrenceDocs = dates.map((date) => ({
        recurringActivity: activity._id,
        assignee: req.user.id,
        scheduledDate: date,
        status: "pending",
      }));
      await RecurringOccurrence.insertMany(occurrenceDocs, { ordered: false });
    }

    await notifyActivityCreated(activity);

    const populated = await Activity.findById(activity._id)
      .populate("assignee", "name")
      .populate("task", "title");

    // Attach stats for recurring
    const result = populated.toObject();
    if (recurring) {
      result.recurringStats = await getRecurringStats(
        activity._id,
        totalOccurrences,
      );
    }

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── UPDATE Activity ────────────────────────────────────────────────────
// Recurring fields are intentionally NOT updatable after creation —
// changing weekdays/dates would invalidate existing occurrence records.
// Existing logic completely unchanged.
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

    if (activity.assignee.toString() !== req.user.id)
      return res.status(403).json({ msg: "Not authorized" });

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

    if (isAlreadyLocked && !isOnlyStatusChange)
      return res
        .status(403)
        .json({ msg: "This activity is locked and can no longer be edited." });

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

    if (activity.activityType === "Daily") {
      activity.startDate = null;
      activity.endDate = null;
    }
    if (activity.activityType !== "Weekly") activity.reminderDays = [];

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

// ── COMPLETE OCCURRENCE ────────────────────────────────────────────────
// POST /api/activities/:id/complete-occurrence
// Body: { scheduledDate: "YYYY-MM-DD" }
// Rules: must be owner, cannot be future, cannot be already completed.
router.post("/:id/complete-occurrence", auth, async (req, res) => {
  try {
    const { scheduledDate } = req.body;
    if (!scheduledDate)
      return res.status(400).json({ msg: "scheduledDate is required" });

    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ msg: "Activity not found" });
    if (!activity.isRecurring)
      return res.status(400).json({ msg: "This activity is not recurring" });
    if (activity.assignee.toString() !== req.user.id)
      return res.status(403).json({ msg: "Not authorized" });

    const dateOnly = toDateOnly(scheduledDate);
    const today = todayUTC();

    if (dateOnly > today)
      return res.status(400).json({
        msg: "You cannot complete a future occurrence. Come back on the scheduled date.",
      });

    const occurrence = await RecurringOccurrence.findOne({
      recurringActivity: activity._id,
      scheduledDate: dateOnly,
    });
    if (!occurrence)
      return res.status(404).json({ msg: "No occurrence found for that date" });
    if (occurrence.status === "completed")
      return res
        .status(400)
        .json({ msg: "This occurrence is already completed" });

    occurrence.status = "completed";
    occurrence.completedAt = new Date();
    await occurrence.save();

    const stats = await getRecurringStats(
      activity._id,
      activity.totalOccurrences,
    );
    res.json({ occurrence: annotateOccurrences([occurrence])[0], stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── DELETE Activity ────────────────────────────────────────────────────
// Cascades to RecurringOccurrence docs if activity is recurring.
router.delete("/:id", auth, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ msg: "Activity not found" });

    if (activity.assignee.toString() !== req.user.id)
      return res.status(403).json({ msg: "Not authorized" });

    // Cascade-delete occurrences for recurring activities
    if (activity.isRecurring) {
      await RecurringOccurrence.deleteMany({ recurringActivity: activity._id });
    }

    await activity.deleteOne();
    res.json({ msg: "Activity deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── GET ALL Activities ─────────────────────────────────────────────────
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
        { startDate: { $lte: monthStart }, endDate: { $gte: monthEnd } },
      ];
    }

    const activities = await Activity.find(filter)
      .populate("assignee", "name")
      .populate("task", "title")
      .sort({ createdAt: -1 });

    // Attach recurringStats to recurring activities only
    const results = await Promise.all(
      activities.map(async (act) => {
        const obj = act.toObject();
        if (act.isRecurring) {
          obj.recurringStats = await getRecurringStats(
            act._id,
            act.totalOccurrences,
          );
        }
        return obj;
      }),
    );

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── GET SINGLE Activity ────────────────────────────────────────────────
router.get("/:id", auth, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id)
      .populate("assignee", "name")
      .populate("task", "title");
    if (!activity) return res.status(404).json({ msg: "Activity not found" });

    const result = activity.toObject();

    // For recurring activities, attach annotated occurrences + stats
    if (activity.isRecurring) {
      const occs = await RecurringOccurrence.find({
        recurringActivity: activity._id,
      }).sort({ scheduledDate: 1 });
      result.occurrences = annotateOccurrences(occs);
      result.recurringStats = await getRecurringStats(
        activity._id,
        activity.totalOccurrences,
      );
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
