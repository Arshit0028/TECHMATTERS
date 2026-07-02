// models/RecurringOccurrence.js
const mongoose = require("mongoose");

// ── RecurringOccurrence ───────────────────────────────────────────────────────
// One document per scheduled occurrence date for a RecurringActivity.
// status lifecycle:
//   "pending"  — not yet due or not yet acted on
//   "completed"— employee marked it complete (only on/after its date)
//   "late"     — past its date, not completed (computed on read, not stored,
//                but completedAt===null && date < today means "late")
//
// NOTE: "late" is intentionally NOT a stored enum value — we compute it in the
// API layer so employees can still complete late occurrences (they just show a
// warning). This avoids needing a cron job entirely.

const RecurringOccurrenceSchema = new mongoose.Schema(
  {
    recurringActivity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecurringActivity",
      required: true,
      index: true,
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // The scheduled date for this occurrence (time stripped — midnight UTC).
    scheduledDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Unique constraint: one occurrence record per (activity, scheduledDate).
// Prevents duplicates even under concurrent requests.
RecurringOccurrenceSchema.index(
  { recurringActivity: 1, scheduledDate: 1 },
  { unique: true },
);

RecurringOccurrenceSchema.index({ assignee: 1, scheduledDate: 1 });
RecurringOccurrenceSchema.index({ assignee: 1, status: 1 });

module.exports = mongoose.model(
  "RecurringOccurrence",
  RecurringOccurrenceSchema,
);
