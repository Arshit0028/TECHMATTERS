// routes/projects.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Project = require("../models/Project");
const auth = require("../middleware/auth");
const { can } = require("../middleware/permissions");

// Roles that can see ALL projects (admin views)
const ADMIN_ROLES = ["super-admin", "admin", "manager", "project-manager"];

/* ============================================================
   Helper: build a user-scoped project filter
   - Admins/managers/project-managers: see ALL projects
   - Everyone else: sees projects where they are a teamMember,
     projectManager, createdBy, OR the reportingManager of any
     team member on the project
============================================================ */
// ── Reportee lookup cache ─────────────────────────────────────────────────────
// buildUserFilter previously hit the DB with User.find({ reportingManager })
// on EVERY project request. Org charts change rarely, so we cache the reportee
// id list per-manager for a short TTL. This removes one query per request on
// the hot project-list path without risking stale access (60s is well under
// any realistic "added a report, must see their projects instantly" need).
const REPORTEE_TTL_MS = 60 * 1000;
const reporteeCache = new Map(); // uid string -> { ids, expiresAt }

async function getReporteeIds(uid) {
  const key = uid.toString();
  const now = Date.now();
  const cached = reporteeCache.get(key);
  if (cached && cached.expiresAt > now) return cached.ids;

  const User = require("../models/User");
  const reportees = await User.find({ reportingManager: uid }, "_id").lean();
  const ids = reportees.map((u) => u._id);
  reporteeCache.set(key, { ids, expiresAt: now + REPORTEE_TTL_MS });
  return ids;
}

async function buildUserFilter(user, extraFilter = {}) {
  if (ADMIN_ROLES.includes(user.accessLevel)) {
    return extraFilter; // no restriction
  }

  const uid = new mongoose.Types.ObjectId(user.id);

  // Find all users who report to this user (cached — see getReporteeIds)
  const reporteeIds = await getReporteeIds(uid);

  // User can see a project if they are:
  // 1. A direct team member
  // 2. The project manager
  // 3. The creator
  // 4. The reporting manager of any team member on the project
  const userConditions = [
    { teamMembers: { $in: [uid] } },
    { projectManager: uid },
    { createdBy: uid },
  ];

  if (reporteeIds.length > 0) {
    userConditions.push({ teamMembers: { $in: reporteeIds } });
  }

  return {
    $and: [{ $or: userConditions }, extraFilter],
  };
}

/* ============================================================
   GET /api/projects/my-projects
   Kept for backward compatibility — same logic as GET /
============================================================ */
router.get("/my-projects", auth, async (req, res) => {
  try {
    const { search, status } = req.query;
    const extraFilter = {};
    if (status) extraFilter.status = status;
    if (search?.trim()) {
      extraFilter.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const filter = await buildUserFilter(req.user, extraFilter);

    const projects = await Project.find(filter)
      .populate(
        "teamMembers projectManager createdBy",
        "name email accessLevel reportingManager",
      )
      .populate("progressUpdates.addedBy", "name")
      .sort({ updatedAt: -1 })
      .lean();

    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   GET /api/projects
   ✅ NOW FILTERED BY USER — entry/tech users only see their own
   Admins/managers see all.
   Supports: page, limit, search, status, priority query params
============================================================ */
router.get("/", [auth, can("projects", "read")], async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const { search, status, priority } = req.query;

    const extraFilter = {};
    if (status) extraFilter.status = status;
    if (priority) extraFilter.priority = priority;
    if (search?.trim()) {
      extraFilter.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    // ✅ KEY FIX: scope query to the requesting user
    const filter = await buildUserFilter(req.user, extraFilter);

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .populate(
          "teamMembers projectManager createdBy",
          "name email accessLevel reportingManager",
        )
        .populate("progressUpdates.addedBy", "name")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Project.countDocuments(filter),
    ]);

    res.json({
      projects,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   GET /api/projects/:id
============================================================ */
router.get("/:id", [auth, can("projects", "read")], async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate(
        "teamMembers projectManager createdBy",
        "name email accessLevel reportingManager",
      )
      .populate("progressUpdates.addedBy", "name")
      .lean();

    if (!project) return res.status(404).json({ msg: "Project not found" });

    // Non-admin users can only view projects they belong to
    if (!ADMIN_ROLES.includes(req.user.accessLevel)) {
      const User = require("../models/User");
      const uid = req.user.id;

      const members = (project.teamMembers || []).map((m) =>
        (m._id || m).toString(),
      );
      const managerId = project.projectManager
        ? (project.projectManager._id || project.projectManager).toString()
        : "";
      const createdById = project.createdBy
        ? (project.createdBy._id || project.createdBy).toString()
        : "";

      // Check if user is reporting manager of any team member
      const memberObjectIds = (project.teamMembers || []).map(
        (m) => m._id || m,
      );
      const reporteeCount =
        memberObjectIds.length > 0
          ? await User.countDocuments({
              _id: { $in: memberObjectIds },
              reportingManager: new mongoose.Types.ObjectId(uid),
            })
          : 0;

      const belongs =
        members.includes(uid) ||
        managerId === uid ||
        createdById === uid ||
        reporteeCount > 0;

      if (!belongs) return res.status(403).json({ msg: "Access denied" });
    }

    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   POST /api/projects
============================================================ */
router.post("/", [auth, can("projects", "create")], async (req, res) => {
  try {
    const projectData = { ...req.body, createdBy: req.user.id };

    if (projectData.teamMembers && typeof projectData.teamMembers === "string")
      projectData.teamMembers = JSON.parse(projectData.teamMembers);
    if (projectData.milestones && typeof projectData.milestones === "string")
      projectData.milestones = JSON.parse(projectData.milestones);
    if (projectData.projectManager === "") projectData.projectManager = null;

    const project = new Project(projectData);
    await project.save();
    await project.populate(
      "teamMembers projectManager createdBy",
      "name email accessLevel reportingManager",
    );

    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message });
  }
});

/* ============================================================
   PUT /api/projects/:id
============================================================ */
router.put("/:id", [auth, can("projects", "write")], async (req, res) => {
  try {
    let updates = { ...req.body };

    if (updates.teamMembers && typeof updates.teamMembers === "string")
      updates.teamMembers = JSON.parse(updates.teamMembers);
    if (updates.milestones && typeof updates.milestones === "string")
      updates.milestones = JSON.parse(updates.milestones);
    if (updates.projectManager === "") updates.projectManager = null;

    const project = await Project.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    })
      .populate(
        "teamMembers projectManager createdBy",
        "name email accessLevel reportingManager",
      )
      .populate("progressUpdates.addedBy", "name");

    if (!project) return res.status(404).json({ msg: "Project not found" });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message });
  }
});

/* ============================================================
   DELETE /api/projects/:id
   Cascade: removes orphaned tasks & activities
============================================================ */
router.delete("/:id", [auth, can("projects", "delete")], async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ msg: "Project not found" });

    try {
      const Task = require("../models/Task");
      const Activity = require("../models/Activity");
      await Promise.all([
        Task.deleteMany({ project: project._id }),
        Activity.deleteMany({ project: project._id }),
      ]);
    } catch (_) {
      // Models may not exist in all setups — non-fatal
    }

    await project.deleteOne();
    res.json({ msg: "Project and related data deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   POST /api/projects/:id/progress
   Any authenticated user who belongs to the project can update
============================================================ */
router.post("/:id/progress", auth, async (req, res) => {
  try {
    const { note, percentage } = req.body;
    if (percentage === undefined || percentage === null)
      return res.status(400).json({ msg: "percentage is required" });

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ msg: "Project not found" });

    // Verify user belongs to this project (admins always allowed)
    const members = (project.teamMembers || []).map((m) => m.toString());
    const mgr = project.projectManager?.toString();
    const creator = project.createdBy?.toString();

    const belongs =
      members.includes(req.user.id) ||
      mgr === req.user.id ||
      creator === req.user.id ||
      ADMIN_ROLES.includes(req.user.accessLevel);

    if (!belongs)
      return res.status(403).json({ msg: "Not a member of this project" });

    project.progressUpdates = project.progressUpdates || [];
    project.progressUpdates.push({
      note: note || "",
      percentage: Math.min(100, Math.max(0, parseInt(percentage))),
      addedBy: req.user.id,
      createdAt: new Date(),
    });
    project.progress = Math.min(100, Math.max(0, parseInt(percentage)));
    await project.save();

    await project.populate("progressUpdates.addedBy", "name");
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   DELETE /api/projects/:id/progress/:entryId
   Remove a single progress update entry
============================================================ */
router.delete("/:id/progress/:entryId", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ msg: "Project not found" });

    const entry = (project.progressUpdates || []).find(
      (u) => u._id?.toString() === req.params.entryId,
    );

    // Only the author or an admin can delete
    const isAuthor = entry?.addedBy?.toString() === req.user.id;
    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);

    if (!entry) return res.status(404).json({ msg: "Entry not found" });
    if (!isAuthor && !isAdmin)
      return res
        .status(403)
        .json({ msg: "Not authorised to delete this entry" });

    project.progressUpdates = project.progressUpdates.filter(
      (u) => u._id?.toString() !== req.params.entryId,
    );
    await project.save();
    await project.populate("progressUpdates.addedBy", "name");
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
