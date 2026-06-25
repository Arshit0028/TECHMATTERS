// routes/notifications.js
const express = require("express");
const router = express.Router();

const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const { ensureTodayReminders } = require("../utils/reminders");

// ── Get my notifications ─────────────────────────────────────────────
// Generates any reminders due today before returning the list, so the
// bell is always up to date the moment it's opened.
router.get("/", auth, async (req, res) => {
  try {
    await ensureTodayReminders(req.user.id);

    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Mark one notification read ───────────────────────────────────────
router.put("/:id/read", auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ msg: "Notification not found" });
    }
    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    notification.read = true;
    await notification.save();

    res.json(notification);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Mark all my notifications read ───────────────────────────────────
router.put("/read-all", auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { $set: { read: true } },
    );
    res.json({ msg: "All notifications marked read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
