// models/Notification.js
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    activity: { type: mongoose.Schema.Types.ObjectId, ref: "Activity" },
    type: {
      type: String,
      enum: ["activity_created", "activity_reminder"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    read: { type: Boolean, default: false },
    // "YYYY-MM-DD" in the app's local timezone (see utils/dateHelpers.js).
    // Used to make reminder generation idempotent: at most one
    // "activity_reminder" per activity per local day.
    dateKey: { type: String, required: true },
  },
  { timestamps: true },
);

NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, read: 1 });

// Prevents duplicate reminder notifications for the same activity on the
// same day, even if ensureTodayReminders() runs concurrently (e.g. two tabs
// open at once). Only applies to "activity_reminder" — "activity_created"
// notifications are one-off and don't need this guard.
NotificationSchema.index(
  { activity: 1, type: 1, dateKey: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "activity_reminder" },
  },
);

module.exports = mongoose.model("Notification", NotificationSchema);
