const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const TaskSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    // ── assignee removed ──────────────────────────────────────────────────────
    // Employees create tasks for themselves only.
    // Cross-employee assignment is handled by the AssignedTask system.
    assigner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true, // ← indexed so employee "my tasks" queries are fast
    },
    startDate: { type: Date },
    endDate: { type: Date },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["To Do", "In Progress", "Review", "Done"],
      default: "To Do",
    },
    attachments: [attachmentSchema],
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

TaskSchema.index({ project: 1, status: 1 });
TaskSchema.index({ assigner: 1, status: 1 });
TaskSchema.index({ endDate: 1 });
TaskSchema.index({ title: "text", description: "text" });

TaskSchema.pre("save", function (next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error("End date must be after start date"));
  }
  next();
});

module.exports = mongoose.model("Task", TaskSchema);
