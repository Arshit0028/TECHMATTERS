// models/Activity.js
const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    name: String,
    url: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ActivitySchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task" },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    startDate: Date,
    endDate: Date,
    activityType: {
      type: String,
      enum: ["Daily", "One Time", "Weekly", "Monthly", "Yearly"],
      default: "One Time",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    // "Submitted" added on top of existing values — once an activity is
    // Submitted (to manager) or Completed, the frontend disables editing.
    // No existing records are affected since this is purely additive to
    // the enum; default behavior for Pending/In Progress/Completed is
    // unchanged.
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Submitted", "Completed"],
      default: "Pending",
    },
    attachments: [attachmentSchema],
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Activity" }],
    // Only meaningful when activityType === "Weekly". Short-day values
    // (Sun..Sat) selected on the create/edit form — drives which day(s)
    // this activity shows up / sends a reminder. See utils/reminders.js.
    reminderDays: {
      type: [String],
      enum: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      default: [],
    },

    // ── Recurring Activity fields (additive — default false/empty) ──────────
    // When isRecurring is true, occurrences are stored in the separate
    // RecurringOccurrence collection (keyed by this Activity's _id).
    // Non-recurring activities are completely unaffected (isRecurring
    // defaults to false, totalOccurrences defaults to 0).
    isRecurring: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Which weekdays this recurring activity runs on.
    // e.g. ["Mon","Wed","Fri"]. Only meaningful when isRecurring===true.
    weekdays: {
      type: [String],
      enum: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      default: [],
    },
    // Total scheduled occurrences computed on creation — stored here for
    // fast stats queries without needing to count occurrence docs each time.
    totalOccurrences: {
      type: Number,
      default: 0,
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// ── Production indexes ────────────────────────────────────────────────────────
ActivitySchema.index({ assignee: 1, status: 1 });
ActivitySchema.index({ assignee: 1, startDate: 1 });
ActivitySchema.index({ task: 1 });
ActivitySchema.index({ endDate: 1 });
// Fast lookup of all recurring activities for a user
ActivitySchema.index({ assignee: 1, isRecurring: 1 });

module.exports = mongoose.model("Activity", ActivitySchema);
