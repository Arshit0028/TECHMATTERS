// routes/activities.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");

const Activity = require("../models/Activity");
const auth = require("../middleware/auth");

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

// Make sure uploads folder exists (create it manually or add in server.js)

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
    } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ msg: "Name is required" });
    }

    const activity = new Activity({
      name: name.trim(),
      description: description || "",
      assignee: req.user.id,
      startDate: startDate || null,
      endDate: endDate || null,
      activityType: activityType || "One Time",
      priority: priority || "Medium",
      status: status || "Pending",
    });

    // Handle attachments
    if (req.files && req.files.length > 0) {
      activity.attachments = req.files.map((file) => ({
        name: file.originalname,
        url: `/uploads/activities/${file.filename}`,
        uploadedBy: req.user.id,
      }));
    }

    await activity.save();

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
    } = req.body;

    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ msg: "Activity not found" });

    // Only owner or admin can edit
    if (activity.assignee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    if (name) activity.name = name.trim();
    if (description !== undefined) activity.description = description;
    if (startDate !== undefined) activity.startDate = startDate || null;
    if (endDate !== undefined) activity.endDate = endDate || null;
    if (activityType) activity.activityType = activityType;
    if (priority) activity.priority = priority;
    if (status) activity.status = status;

    // New attachments
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

// ── Get all activities (for list) ────────────────────────────────────
router.get("/", auth, async (req, res) => {
  try {
    const activities = await Activity.find({ assignee: req.user.id })
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
