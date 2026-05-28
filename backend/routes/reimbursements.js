// routes/reimbursements.js
const express = require("express");
const router = express.Router();
const { body, query, param, validationResult } = require("express-validator");
const Reimbursement = require("../models/Reimbursement");
const auth = require("../middleware/auth");
const { can, ADMIN_ROLES } = require("../middleware/permissions");
const upload = require("../middleware/upload");

// ── Helper: HR can see and action all reims, but not mark as Paid ─────────────
const isAdminOrHR = (accessLevel) =>
  ADMIN_ROLES.includes(accessLevel) || accessLevel === "hr";

// GET all reimbursements (with pagination & filters)
router.get(
  "/",
  [
    auth,
    can("reimbursements", "read"),
    query("status")
      .optional()
      .isIn(["Pending", "Approved", "Rejected", "Paid"]),
    query("project").optional().isMongoId(),
    query("employee").optional().isMongoId(),
    query("month").optional().isInt({ min: 1, max: 12 }),
    query("year").optional().isInt({ min: 2000, max: 2100 }),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    try {
      const isAdmin = isAdminOrHR(req.user.accessLevel); // ← updated (was ADMIN_ROLES.includes)
      const {
        status,
        project,
        page = 1,
        limit = 20,
        employee,
        month,
        year,
      } = req.query;

      const filter = {};

      // Admins/HR can filter by a specific employee; non-admins see only their own
      if (!isAdmin) {
        filter.employee = req.user.id;
      } else if (employee) {
        filter.employee = employee;
      }

      if (status) filter.status = status;
      if (project) filter.project = project;

      // Filter by expense month + year if both are provided
      if (month && year) {
        const m = parseInt(month);
        const y = parseInt(year);
        filter.expenseDate = {
          $gte: new Date(y, m - 1, 1),
          $lt: new Date(y, m, 1),
        };
      }

      const skip = (page - 1) * limit;

      const [reimbursements, total] = await Promise.all([
        Reimbursement.find(filter)
          .populate("employee project submittedTo", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Reimbursement.countDocuments(filter),
      ]);

      res.json({
        data: reimbursements,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Server error" });
    }
  },
);

// GET single reimbursement
router.get(
  "/:id",
  [auth, can("reimbursements", "read"), param("id").isMongoId()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    try {
      const reimbursement = await Reimbursement.findById(
        req.params.id,
      ).populate("employee project submittedTo", "name email");

      if (!reimbursement)
        return res.status(404).json({ msg: "Reimbursement not found" });

      const isAdmin = isAdminOrHR(req.user.accessLevel); // ← updated (was ADMIN_ROLES.includes)
      if (!isAdmin && reimbursement.employee?._id?.toString() !== req.user.id) {
        return res.status(403).json({ msg: "Access denied" });
      }

      res.json(reimbursement);
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Server error" });
    }
  },
);

// CREATE reimbursement
router.post(
  "/",
  [
    auth,
    can("reimbursements", "create"),
    upload.array("receipts", 5),
    body("title").trim().isLength({ min: 3, max: 100 }),
    body("description").trim().isLength({ min: 10 }),
    body("amount").isFloat({ min: 1 }),
    body("expenseDate").isISO8601(),
    // submittedTo is now optional — removed from frontend form
    body("submittedTo")
      .optional({ nullable: true, checkFalsy: true })
      .isMongoId(),
    body("project").optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    try {
      const receiptFiles = (req.files || []).map((file) => ({
        name: file.originalname,
        url: file.path,
        uploadedBy: req.user.id,
      }));

      // Build reimbursement data — only include submittedTo if provided
      const reimbData = {
        title: req.body.title,
        description: req.body.description,
        amount: parseFloat(req.body.amount),
        expenseDate: req.body.expenseDate,
        employee: req.user.id,
        receipts: receiptFiles,
      };

      if (req.body.project) reimbData.project = req.body.project;
      if (req.body.submittedTo) reimbData.submittedTo = req.body.submittedTo;

      const reimbursement = new Reimbursement(reimbData);

      await reimbursement.save();
      await reimbursement.populate(
        "employee project submittedTo",
        "name email",
      );

      res.status(201).json(reimbursement);
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Server error" });
    }
  },
);

// UPDATE status
router.put(
  "/:id/status",
  [
    auth,
    can("reimbursements", "update"),
    param("id").isMongoId(),
    body("status").optional().isIn(["Approved", "Rejected", "Paid"]),
    body("reviewerComments").optional().trim(),
    body("paymentStatus").optional().isIn(["Processing", "Completed"]),
    body("paymentDate").optional().isISO8601(),
    body("paymentMethod").optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    try {
      // ← HR can Approve/Reject but not mark as Paid (finance/admin only)
      if (req.user.accessLevel === "hr" && req.body.status === "Paid") {
        return res
          .status(403)
          .json({ msg: "HR cannot mark reimbursements as Paid" });
      }

      const reimbursement = await Reimbursement.findById(req.params.id);
      if (!reimbursement) return res.status(404).json({ msg: "Not found" });

      Object.assign(reimbursement, req.body);
      await reimbursement.save();
      await reimbursement.populate(
        "employee project submittedTo",
        "name email",
      );

      res.json(reimbursement);
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Server error" });
    }
  },
);

module.exports = router;
