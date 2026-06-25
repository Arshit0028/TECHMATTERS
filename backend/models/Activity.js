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
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed"],
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
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// ── Production indexes ────────────────────────────────────────────────────────
// Activities are queried by assignee (employee dashboards / monthly reports),
// by the parent task, and filtered by status. These cover the hot paths.
ActivitySchema.index({ assignee: 1, status: 1 });
ActivitySchema.index({ assignee: 1, startDate: 1 });
ActivitySchema.index({ task: 1 });
ActivitySchema.index({ endDate: 1 });

module.exports = mongoose.model("Activity", ActivitySchema);
