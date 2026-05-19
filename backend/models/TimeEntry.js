const mongoose = require("mongoose");

const TimeEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
  },
  date: { type: Date, required: true },
  hours: { type: Number, required: true, min: 0.5, max: 24 },
  description: { type: String, required: true },
  taskType: {
    type: String,
    enum: ["development", "meeting", "research", "bug-fix", "documentation"],
    default: "development",
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("TimeEntry", TimeEntrySchema);
