// routes/monthlyReports.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const MonthlyReport = require("../models/MonthlyReport");
const Activity = require("../models/Activity");
const Task = require("../models/Task");
const User = require("../models/User");
const Reimbursement = require("../models/Reimbursement");
const auth = require("../middleware/auth");
const { can, ADMIN_ROLES } = require("../middleware/permissions");

// ── Helpers ──────────────────────────────────────────────────────────────────
const isAdminOrManager = (user) =>
  ADMIN_ROLES.includes(user.accessLevel) ||
  ["manager", "project-manager"].includes(user.accessLevel);

const populate = (query) =>
  query
    .populate("employee", "name email accessLevel reportingManager")
    .populate("reportingManager", "name email")
    .populate("tasks.assignedBy", "name")
    .populate("tasks.project", "name")
    .populate("tasks.taskRef", "title status priority")
    .populate("nextMonthPlan.project", "name")
    .populate("nextMonthPlan.assignee", "name")
    .populate("reimbursements", "title amount status receipts expenseDate")
    .populate("approvedBy", "name")
    .populate("rejectedBy", "name");

const sanitizeNextMonthPlan = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && item.title && item.title.trim() !== "")
    .map((item) => ({
      title: item.title.trim(),
      project: item.project || undefined,
      assignee: item.assignee || undefined,
      priority: item.priority || "Medium",
      notes: item.notes || "",
      activityType: item.activityType || "",
      startDate: item.startDate || undefined,
      endDate: item.endDate || undefined,
    }));
};

// ── Fetch activities for an employee in a given month/year ───────────────────
async function getActivitiesForReport(employeeId, month, year) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  return Activity.find({
    assignee: employeeId,
    $or: [
      { startDate: { $gte: startOfMonth, $lte: endOfMonth } },
      { endDate: { $gte: startOfMonth, $lte: endOfMonth } },
      {
        startDate: null,
        endDate: null,
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      },
    ],
  })
    .populate("task", "title")
    .lean();
}

// ── Convert a Mongoose doc and attach activities ──────────────────────────────
async function withActivities(reportDoc) {
  const obj = reportDoc.toObject ? reportDoc.toObject() : reportDoc;
  const employeeId = obj.employee?._id ?? obj.employee;
  obj.activities = await getActivitiesForReport(
    employeeId,
    obj.month,
    obj.year,
  );
  return obj;
}

/* ============================================================
   GET /api/monthly-reports/mine?month=5&year=2025
   Employee fetches (or auto-creates) their current report
============================================================ */
router.get("/mine", auth, async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    let report = await MonthlyReport.findOne({
      employee: req.user.id,
      month,
      year,
    });

    if (!report) {
      const user = await User.findById(req.user.id).select("reportingManager");
      report = new MonthlyReport({
        employee: req.user.id,
        reportingManager: user?.reportingManager || null,
        month,
        year,
        status: "draft",
        tasks: [],
        nextMonthPlan: [],
        nextMonthFreeText: "",
        reimbursements: [],
      });
      await report.save();
    }

    const populated = await populate(MonthlyReport.findById(report._id));
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   GET /api/monthly-reports/team?month=5&year=2025
   Admin/Manager: list all reports — WITH activities attached
   NOTE: defined BEFORE /:id so it is not swallowed by that route
============================================================ */
router.get("/team", auth, async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ msg: "Access denied" });
    }

    const month = req.query.month ? parseInt(req.query.month) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;

    let query = {};

    // Super Admin sees ALL; manager sees only their team
    if (!ADMIN_ROLES.includes(req.user.accessLevel)) {
      query.reportingManager = req.user.id;
    }

    if (month) query.month = month;
    if (year) query.year = year;

    const reports = await populate(
      MonthlyReport.find(query).sort({ year: -1, month: -1 }),
    );

    const result = await Promise.all(reports.map((r) => withActivities(r)));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   PATCH /api/monthly-reports/:id/link-tasks
   Links external Task documents into the report's task list.
   Safe to call repeatedly — deduplicates by taskRef.
============================================================ */
router.patch("/:id/link-tasks", auth, async (req, res) => {
  try {
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds)) {
      return res.status(400).json({ msg: "taskIds must be an array" });
    }

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (report.employee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your report" });
    }

    // Build set of already-linked external task IDs
    const alreadyLinked = new Set(
      report.tasks.filter((t) => t.taskRef).map((t) => t.taskRef.toString()),
    );

    // Only fetch tasks not yet linked
    const newIds = taskIds.filter((id) => !alreadyLinked.has(id.toString()));

    if (newIds.length > 0) {
      const externalTasks = await Task.find({ _id: { $in: newIds } })
        .populate("assigner", "name")
        .populate("project", "name")
        .lean();

      for (const t of externalTasks) {
        report.tasks.push({
          taskRef: t._id,
          title: t.title,
          assignedBy: t.assigner?._id ?? t.assigner,
          project: t.project?._id ?? t.project,
          dueDate: t.endDate ?? undefined,
          isDone: false,
          undoneNote: "",
          doneNote: "",
        });
      }

      await report.save();
    }

    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   GET /api/monthly-reports/:id
   Single report — WITH activities attached
============================================================ */
router.get("/:id", auth, async (req, res) => {
  try {
    const report = await populate(MonthlyReport.findById(req.params.id));
    if (!report) return res.status(404).json({ msg: "Report not found" });

    const isOwner = report.employee._id.toString() === req.user.id;
    if (!isOwner && !isAdminOrManager(req.user)) {
      return res.status(403).json({ msg: "Access denied" });
    }

    const result = await withActivities(report);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   POST /api/monthly-reports
   Create a new report
============================================================ */
router.post("/", auth, async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) {
      return res.status(400).json({ msg: "Month and year required" });
    }

    const existing = await MonthlyReport.findOne({
      employee: req.user.id,
      month: parseInt(month),
      year: parseInt(year),
    });
    if (existing) {
      return res
        .status(400)
        .json({ msg: "Report already exists for this month/year" });
    }

    const user = await User.findById(req.user.id).select("reportingManager");
    const report = new MonthlyReport({
      employee: req.user.id,
      reportingManager: user?.reportingManager || null,
      month: parseInt(month),
      year: parseInt(year),
      status: "draft",
    });

    await report.save();
    const populated = await populate(MonthlyReport.findById(report._id));
    res.status(201).json(populated);
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(400).json({ msg: "Report already exists" });
    }
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   POST /api/monthly-reports/:id/self-tasks
   Employee adds their own task manually
============================================================ */
router.post("/:id/self-tasks", auth, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ msg: "Task title required" });

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (report.employee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your report" });
    }
    if (!["draft", "rejected"].includes(report.status)) {
      return res.status(400).json({ msg: "Cannot edit submitted report" });
    }

    report.tasks.push({
      title: title.trim(),
      isDone: false,
      undoneNote: "",
      doneNote: "",
    });

    await report.save();
    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   PATCH /api/monthly-reports/:id/tasks/:taskId
   Update task isDone status or notes.
   taskId may be the external Task._id (taskRef) OR the subdoc _id.
============================================================ */
router.patch("/:id/tasks/:taskId", auth, async (req, res) => {
  try {
    const { isDone, doneNote, undoneNote, title } = req.body;

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (report.employee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your report" });
    }
    if (!["draft", "rejected"].includes(report.status)) {
      return res.status(400).json({ msg: "Cannot edit submitted report" });
    }

    // Find by taskRef (external Task ID) first, then fall back to subdoc _id
    let task =
      report.tasks.find(
        (t) => t.taskRef && t.taskRef.toString() === req.params.taskId,
      ) ?? report.tasks.id(req.params.taskId);

    // If still not found, auto-link it on the fly
    if (!task) {
      const ext = await Task.findById(req.params.taskId)
        .populate("assigner", "name")
        .populate("project", "name")
        .lean();

      if (!ext) return res.status(404).json({ msg: "Task not found" });

      report.tasks.push({
        taskRef: ext._id,
        title: title || ext.title,
        assignedBy: ext.assigner?._id ?? ext.assigner,
        project: ext.project?._id ?? ext.project,
        dueDate: ext.endDate ?? undefined,
        isDone: false,
        undoneNote: "",
        doneNote: "",
      });

      task = report.tasks[report.tasks.length - 1];
    }

    if (typeof isDone === "boolean") {
      task.isDone = isDone;
      if (isDone) {
        task.completedAt = new Date();
        task.undoneNote = "";
      } else {
        task.completedAt = undefined;
      }
    }

    if (doneNote !== undefined) task.doneNote = doneNote;
    if (undoneNote !== undefined) task.undoneNote = undoneNote;

    await report.save();
    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   PATCH /api/monthly-reports/:id/next-month-plan
============================================================ */
router.patch("/:id/next-month-plan", auth, async (req, res) => {
  try {
    const { nextMonthPlan, nextMonthFreeText } = req.body;

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (report.employee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your report" });
    }
    if (!["draft", "rejected"].includes(report.status)) {
      return res.status(400).json({ msg: "Cannot edit submitted report" });
    }

    report.nextMonthPlan = sanitizeNextMonthPlan(nextMonthPlan);
    if (nextMonthFreeText !== undefined) {
      report.nextMonthFreeText = nextMonthFreeText;
    }

    await report.save();
    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   PATCH /api/monthly-reports/:id/link-reimbursements
============================================================ */
router.patch("/:id/link-reimbursements", auth, async (req, res) => {
  try {
    const { reimbursementIds } = req.body;

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (report.employee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your report" });
    }
    if (!["draft", "rejected"].includes(report.status)) {
      return res.status(400).json({ msg: "Cannot edit submitted report" });
    }

    const validReimbs = await Reimbursement.find({
      _id: { $in: reimbursementIds || [] },
      employee: req.user.id,
    });

    report.reimbursements = validReimbs.map((r) => r._id);
    await report.save();

    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   POST /api/monthly-reports/:id/submit
============================================================ */
router.post("/:id/submit", auth, async (req, res) => {
  try {
    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (report.employee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your report" });
    }
    if (!["draft", "rejected"].includes(report.status)) {
      return res.status(400).json({ msg: "Report already submitted" });
    }

    const incompleteWithoutNote = report.tasks.filter(
      (t) => !t.isDone && !t.undoneNote?.trim(),
    );
    if (incompleteWithoutNote.length > 0) {
      return res.status(400).json({
        msg: `Please add explanation for ${incompleteWithoutNote.length} incomplete task(s)`,
      });
    }

    report.status = "submitted";
    report.submittedAt = new Date();
    await report.save();

    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   POST /api/monthly-reports/:id/manager-review
   Manager: add remarks → manager_reviewed
============================================================ */
router.post("/:id/manager-review", auth, async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ msg: "Access denied" });
    }

    const { managerRemarks } = req.body;

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (report.status !== "submitted") {
      return res.status(400).json({ msg: "Report must be submitted first" });
    }

    report.status = "manager_reviewed";
    report.managerReviewedAt = new Date();
    report.managerRemarks = managerRemarks || "";
    await report.save();

    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   POST /api/monthly-reports/:id/approve
   Admin: final approval + score
   Accepts both submitted AND manager_reviewed
============================================================ */
router.post("/:id/approve", auth, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.accessLevel)) {
      return res.status(403).json({ msg: "Admin access required" });
    }

    const { adminRemarks, adminScore } = req.body;

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (!["submitted", "manager_reviewed"].includes(report.status)) {
      return res.status(400).json({
        msg: "Report must be submitted or reviewed before approval",
      });
    }

    report.status = "approved";
    report.adminRemarks = adminRemarks || "";
    report.adminScore = adminScore || 0;
    report.approvedBy = req.user.id;
    report.approvedAt = new Date();
    await report.save();

    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   POST /api/monthly-reports/:id/reject
============================================================ */
router.post("/:id/reject", auth, async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ msg: "Access denied" });
    }

    const { rejectionNote } = req.body;
    if (!rejectionNote?.trim()) {
      return res.status(400).json({ msg: "Rejection note is required" });
    }

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (!["submitted", "manager_reviewed"].includes(report.status)) {
      return res.status(400).json({ msg: "Nothing to reject" });
    }

    report.status = "rejected";
    report.rejectedBy = req.user.id;
    report.rejectedAt = new Date();
    report.rejectionNote = rejectionNote;
    await report.save();

    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   POST /api/monthly-reports/:id/reopen
============================================================ */
router.post("/:id/reopen", auth, async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ msg: "Access denied" });
    }

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (report.status !== "rejected") {
      return res
        .status(400)
        .json({ msg: "Only rejected reports can be reopened" });
    }

    report.status = "draft";
    report.rejectedBy = undefined;
    report.rejectedAt = undefined;
    report.rejectionNote = "";
    await report.save();

    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ============================================================
   PATCH /api/monthly-reports/:id/last-month-note
   Employee saves accomplishments / challenges / learnings
============================================================ */
router.patch("/:id/last-month-note", auth, async (req, res) => {
  try {
    const { accomplishments, challenges, learnings } = req.body;

    const report = await MonthlyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    if (report.employee.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your report" });
    }
    if (!["draft", "rejected"].includes(report.status)) {
      return res.status(400).json({ msg: "Cannot edit submitted report" });
    }

    report.lastMonthNote = {
      accomplishments: accomplishments || "",
      challenges: challenges || "",
      learnings: learnings || "",
    };

    await report.save();
    const updated = await populate(MonthlyReport.findById(report._id));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
