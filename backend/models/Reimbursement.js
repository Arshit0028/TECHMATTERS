const mongoose = require("mongoose");

const receiptSchema = new mongoose.Schema(
  {
    name: String,
    url: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ReimbursementSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    expenseDate: { type: Date, default: Date.now },
    receipts: [receiptSchema],
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Paid"],
      default: "Pending",
    },
    submittedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewerComments: String,
    paymentStatus: {
      type: String,
      enum: ["Pending", "Processing", "Completed"],
      default: "Pending",
    },
    paymentDate: Date,
    paymentMethod: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// ── Production indexes ────────────────────────────────────────────────────────
// Reimbursements are listed per-employee and filtered by status (approval
// queues), routed by submittedTo (approver views), and scoped by project.
ReimbursementSchema.index({ employee: 1, status: 1 });
ReimbursementSchema.index({ employee: 1, expenseDate: -1 });
ReimbursementSchema.index({ submittedTo: 1, status: 1 });
ReimbursementSchema.index({ project: 1 });

module.exports = mongoose.model("Reimbursement", ReimbursementSchema);
