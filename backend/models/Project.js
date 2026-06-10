const mongoose = require("mongoose");

const milestoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    dueDate: {
      type: Date,
    },

    completed: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const progressUpdateSchema = new mongoose.Schema(
  {
    note: {
      type: String,
      default: "",
    },

    percentage: {
      type: Number,
      default: 0,
    },

    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const ProjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    startDate: {
      type: Date,
      default: Date.now,
    },

    endDate: {
      type: Date,
      default: null,
    },

    milestones: [milestoneSchema],

    teamMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    reportingManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    projectManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },

    status: {
      type: String,
      enum: ["Planned", "Active", "Completed", "On Hold"],
      default: "Planned",
    },

    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    progressUpdates: [progressUpdateSchema],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// ── Production indexes ────────────────────────────────────────────────────────
// buildUserFilter() matches on teamMembers / projectManager / createdBy.
// Lists sort by updatedAt and filter by status.
ProjectSchema.index({ teamMembers: 1 });
ProjectSchema.index({ projectManager: 1 });
ProjectSchema.index({ createdBy: 1 });
ProjectSchema.index({ status: 1, updatedAt: -1 });
ProjectSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("Project", ProjectSchema);
