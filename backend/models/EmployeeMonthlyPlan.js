const mongoose = require("mongoose");

const EmployeeMonthlyPlanSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  previousMonthPlan: { type: String, default: "" },
  currentMonthPlan: { type: String, default: "" },
  nextMonthPlan: { type: String, default: "" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedAt: { type: Date, default: Date.now },
});

// ── Production indexes ────────────────────────────────────────────────────────
EmployeeMonthlyPlanSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model(
  "EmployeeMonthlyPlan",
  EmployeeMonthlyPlanSchema,
);
