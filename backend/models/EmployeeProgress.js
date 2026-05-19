const mongoose = require("mongoose");

const EmployeeProgressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  // Monthly categories (all boolean)
  previousMonth: { type: Boolean, default: false },
  currentMonth: { type: Boolean, default: false },
  nextMonthPlan: { type: Boolean, default: false },
  reimbursement: { type: Boolean, default: false },
  planned: { type: Boolean, default: false },
  score: { type: Number, min: 0, max: 100, default: 0 },
  remarks: { type: String, default: "" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EmployeeProgress", EmployeeProgressSchema);
