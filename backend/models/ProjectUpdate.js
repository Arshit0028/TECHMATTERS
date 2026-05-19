const mongoose = require("mongoose");

const ProjectUpdateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
  },
  updateText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  isCompleted: { type: Boolean, default: false }, // admin can tick
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  completedAt: Date,
});

module.exports = mongoose.model("ProjectUpdate", ProjectUpdateSchema);
