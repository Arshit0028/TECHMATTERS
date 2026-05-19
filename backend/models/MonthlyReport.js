const mongoose = require("mongoose");

/**
 * One document per employee per month/year.
 * Covers: task checklist, undone explanations,
 * next-month plan, reimbursements ref, and final submission.
 */
const TaskEntrySchema = new mongoose.Schema(
  {
    taskRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    }, // reference to external Task document
    title: { type: String, required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    isDone: { type: Boolean, default: false },
    undoneNote: { type: String, default: "" }, // written when NOT done
    doneNote: { type: String, default: "" }, // optional note when done
    dueDate: { type: Date },
    completedAt: { type: Date },
  },
  { _id: true },
);

const NextMonthTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    notes: { type: String, default: "" },
    activityType: { type: String, default: "" },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { _id: true },
);

const MonthlyReportSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    month: { type: Number, required: true, min: 1, max: 12 }, // 1–12
    year: { type: Number, required: true },

    // ── Current month task checklist ─────────────────────────────────────────
    tasks: [TaskEntrySchema],

    // ── Next month plan ──────────────────────────────────────────────────────
    nextMonthPlan: [NextMonthTaskSchema],
    nextMonthFreeText: { type: String, default: "" },

    // ── Reimbursement refs added this month ──────────────────────────────────
    reimbursements: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Reimbursement" },
    ],

    // ── Submission & approval lifecycle ──────────────────────────────────────
    // draft → submitted → manager_reviewed → approved | rejected
    status: {
      type: String,
      enum: ["draft", "submitted", "manager_reviewed", "approved", "rejected"],
      default: "draft",
    },
    submittedAt: { type: Date },

    // Manager review
    managerReviewedAt: { type: Date },
    managerRemarks: { type: String, default: "" },

    // Super-admin final
    adminRemarks: { type: String, default: "" },
    adminScore: { type: Number, default: 0, min: 0, max: 100 },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },

    // Rejection
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedAt: { type: Date },
    rejectionNote: { type: String, default: "" },

    // Last month retrospective
    lastMonthNote: {
      accomplishments: { type: String, default: "" },
      challenges: { type: String, default: "" },
      learnings: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

// One report per employee per month/year
MonthlyReportSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("MonthlyReport", MonthlyReportSchema);
