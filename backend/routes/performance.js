const express = require("express");
const mongoose = require("mongoose");
const Project = require("../models/Project");
const router = express.Router();

const User = require("../models/User");
const EmployeeProgress = require("../models/EmployeeProgress");
const ProjectUpdate = require("../models/ProjectUpdate");
const EmployeeMonthlyPlan = require("../models/EmployeeMonthlyPlan");
const Reimbursement = require("../models/Reimbursement");

const auth = require("../middleware/auth");

/* =========================================================
   FULL DASHBOARD
========================================================= */

router.get("/full-dashboard", auth, async (req, res) => {
  try {
    if (!req.user) {
      // routes/monthlyReports.js
      const express = require("express");
      const router = express.Router();
      const mongoose = require("mongoose");

      const MonthlyReport = require("../models/MonthlyReport");
      const Activity = require("../models/Activity"); // ← NEW
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
          .populate("nextMonthPlan.project", "name")
          .populate(
            "reimbursements",
            "title amount status receipts expenseDate",
          )
          .populate("approvedBy", "name")
          .populate("rejectedBy", "name");

      const sanitizeNextMonthPlan = (items) => {
        if (!Array.isArray(items)) return [];
        return items
          .filter((item) => item && item.title && item.title.trim() !== "")
          .map((item) => ({
            title: item.title.trim(),
            project: item.project,
            priority: item.priority || "Medium",
            notes: item.notes || "",
          }));
      };

      // ── NEW: fetch activities for an employee in a given month/year ───────────────
      // Activities have no direct link to MonthlyReport, so we query by assignee +
      // date range.  An activity is "in" the month if:
      //   • its startDate falls in the month, OR
      //   • its endDate falls in the month, OR
      //   • it has no dates but was created during the month (fallback)
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

      // ── NEW: convert a Mongoose doc (or plain object) and attach activities ────────
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
            const user = await User.findById(req.user.id).select(
              "reportingManager",
            );
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
   NOTE: this route must be defined BEFORE /:id
============================================================ */
      router.get("/team", auth, async (req, res) => {
        try {
          if (!isAdminOrManager(req.user)) {
            return res.status(403).json({ msg: "Access denied" });
          }

          const month = req.query.month ? parseInt(req.query.month) : null;
          const year = req.query.year ? parseInt(req.query.year) : null;

          let query = {};

          // Super Admin sees ALL reports; manager sees only their team
          if (!ADMIN_ROLES.includes(req.user.accessLevel)) {
            query.reportingManager = req.user.id;
          }

          // Filter by month/year when supplied (always supply from frontend)
          if (month) query.month = month;
          if (year) query.year = year;

          const reports = await populate(
            MonthlyReport.find(query).sort({ year: -1, month: -1 }),
          );

          // Attach activities to every report in parallel
          const result = await Promise.all(
            reports.map((r) => withActivities(r)),
          );

          res.json(result);
        } catch (err) {
          console.error(err);
          res.status(500).json({ msg: "Server error" });
        }
      });

      /* ============================================================
   GET /api/monthly-reports/:id
   Single report — WITH activities attached
   Used by the admin detail panel fallback fetch
============================================================ */
      router.get("/:id", auth, async (req, res) => {
        try {
          const report = await populate(MonthlyReport.findById(req.params.id));
          if (!report) return res.status(404).json({ msg: "Report not found" });

          // Access control: employee can read their own; admin/manager can read all
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

          const user = await User.findById(req.user.id).select(
            "reportingManager",
          );
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
   Employee adds their own task
============================================================ */
      router.post("/:id/self-tasks", auth, async (req, res) => {
        try {
          const { title } = req.body;
          if (!title)
            return res.status(400).json({ msg: "Task title required" });

          const report = await MonthlyReport.findById(req.params.id);
          if (!report) return res.status(404).json({ msg: "Report not found" });

          if (report.employee.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Not your report" });
          }
          if (!["draft", "rejected"].includes(report.status)) {
            return res
              .status(400)
              .json({ msg: "Cannot edit submitted report" });
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
   Update task done status or notes
============================================================ */
      router.patch("/:id/tasks/:taskId", auth, async (req, res) => {
        try {
          const { isDone, doneNote, undoneNote } = req.body;

          const report = await MonthlyReport.findById(req.params.id);
          if (!report) return res.status(404).json({ msg: "Report not found" });

          if (report.employee.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Not your report" });
          }
          if (!["draft", "rejected"].includes(report.status)) {
            return res
              .status(400)
              .json({ msg: "Cannot edit submitted report" });
          }

          const task = report.tasks.id(req.params.taskId);
          if (!task) return res.status(404).json({ msg: "Task not found" });

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
            return res
              .status(400)
              .json({ msg: "Cannot edit submitted report" });
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
            return res
              .status(400)
              .json({ msg: "Cannot edit submitted report" });
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
            return res
              .status(400)
              .json({ msg: "Report must be submitted first" });
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
   Accepts both submitted AND manager_reviewed (admin can bypass manager step)
============================================================ */
      router.post("/:id/approve", auth, async (req, res) => {
        try {
          if (!ADMIN_ROLES.includes(req.user.accessLevel)) {
            return res.status(403).json({ msg: "Admin access required" });
          }

          const { adminRemarks, adminScore } = req.body;

          const report = await MonthlyReport.findById(req.params.id);
          if (!report) return res.status(404).json({ msg: "Report not found" });

          // Admin can approve from submitted OR manager_reviewed
          if (!["submitted", "manager_reviewed"].includes(report.status)) {
            return res
              .status(400)
              .json({
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
            return res
              .status(400)
              .json({ msg: "Cannot edit submitted report" });
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
      return res.status(401).json({
        msg: "Unauthorized",
      });
    }

    // Employees excluding super-admin
    const employees = await User.find({
      accessLevel: {
        $ne: "super-admin",
      },
    }).select("name email accessLevel");

    // Progress
    const progresses = await EmployeeProgress.find();

    const progressMap = {};

    progresses.forEach((p) => {
      progressMap[p.user.toString()] = p;
    });

    // Monthly plans
    const plans = await EmployeeMonthlyPlan.find();

    const plansMap = {};

    plans.forEach((p) => {
      plansMap[p.user.toString()] = p;
    });

    // Updates
    const updates = await ProjectUpdate.find({
      isCompleted: false,
    })
      .populate("user project", "name")
      .sort({ date: -1 });

    // Reimbursements
    const reimbursements = await Reimbursement.find({
      status: {
        $in: ["Pending", "Approved"],
      },
    })
      .populate("employee project", "name")
      .sort({ createdAt: -1 });

    // Merge employee data
    const employeesData = employees.map((emp) => ({
      _id: emp._id,

      name: emp.name,

      email: emp.email,

      accessLevel: emp.accessLevel,

      progress: progressMap[emp._id.toString()] || {
        previousMonth: false,
        currentMonth: false,
        nextMonthPlan: false,
        reimbursement: false,
        planned: false,
        score: 0,
        remarks: "",
      },

      monthlyPlans: plansMap[emp._id.toString()] || {
        previousMonthPlan: "",
        currentMonthPlan: "",
        nextMonthPlan: "",
      },
    }));

    res.json({
      employees: employeesData,
      updates,
      reimbursements,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

/* =========================================================
   MY UPDATES
========================================================= */

router.get("/my-updates", auth, async (req, res) => {
  try {
    const updates = await ProjectUpdate.find({
      user: req.user.id,
    })
      .populate("project", "name")
      .sort({ date: -1 });

    res.json(updates);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

/* =========================================================
   CREATE UPDATE
========================================================= */
router.post("/updates", auth, async (req, res) => {
  try {
    const { project, updateText } = req.body;

    if (!project || !updateText) {
      return res.status(400).json({
        msg: "Project and update text required",
      });
    }

    // VERIFY EMPLOYEE BELONGS TO PROJECT

    const validProject = await Project.findOne({
      _id: project,

      teamMembers: {
        $in: [new mongoose.Types.ObjectId(req.user.id)],
      },
    });

    if (!validProject) {
      return res.status(403).json({
        msg: "You are not assigned to this project",
      });
    }

    const newUpdate = new ProjectUpdate({
      user: req.user.id,

      project,

      updateText,

      date: new Date(),
    });

    await newUpdate.save();

    res.status(201).json(newUpdate);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

/* =========================================================
   COMPLETE UPDATE
========================================================= */

router.put("/updates/:updateId/complete", auth, async (req, res) => {
  try {
    if (req.user.accessLevel !== "super-admin") {
      return res.status(403).json({
        msg: "Access denied",
      });
    }

    const update = await ProjectUpdate.findById(req.params.updateId);

    if (!update) {
      return res.status(404).json({
        msg: "Update not found",
      });
    }

    update.isCompleted = true;

    update.completedBy = req.user.id;

    update.completedAt = new Date();

    await update.save();

    res.json({
      msg: "Update marked completed",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

/* =========================================================
   UPDATE MONTHLY PLANS
========================================================= */

router.put("/monthly-plans/:userId", auth, async (req, res) => {
  try {
    if (req.user.accessLevel !== "super-admin") {
      return res.status(403).json({
        msg: "Access denied",
      });
    }

    const { previousMonthPlan, currentMonthPlan, nextMonthPlan } = req.body;

    const plan = await EmployeeMonthlyPlan.findOneAndUpdate(
      {
        user: req.params.userId,
      },

      {
        previousMonthPlan,
        currentMonthPlan,
        nextMonthPlan,

        updatedBy: req.user.id,

        updatedAt: new Date(),
      },

      {
        upsert: true,
        new: true,
      },
    );

    res.json(plan);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

/* =========================================================
   UPDATE PROGRESS
========================================================= */

router.put("/progress/:userId", auth, async (req, res) => {
  try {
    if (req.user.accessLevel !== "super-admin") {
      return res.status(403).json({
        msg: "Access denied",
      });
    }

    const progress = await EmployeeProgress.findOneAndUpdate(
      {
        user: req.params.userId,
      },

      {
        ...req.body,

        updatedBy: req.user.id,

        updatedAt: new Date(),
      },

      {
        upsert: true,
        new: true,
      },
    );

    res.json(progress);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

module.exports = router;
