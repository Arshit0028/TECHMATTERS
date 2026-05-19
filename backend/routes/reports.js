// routes/reports.js

const express = require("express");
const router = express.Router();
const TimeEntry = require("../models/TimeEntry");
const User = require("../models/User");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

// ── Helper ─────────────────────────────────────────────────────────────────────
const buildReport = async (userId, year, month) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const entries = await TimeEntry.find({
    user: userId,
    date: { $gte: startDate, $lte: endDate },
  })
    .populate("project", "name client")
    .lean();

  const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
  const projectBreakdown = {};
  entries.forEach((e) => {
    const pName = e.project?.name || "Unknown";
    projectBreakdown[pName] = (projectBreakdown[pName] || 0) + e.hours;
  });

  return {
    entries,
    summary: { totalHours, totalEntries: entries.length, projectBreakdown },
  };
};

// GET /api/reports/monthly/:year/:month — employee's own report
router.get("/monthly/:year/:month", auth, async (req, res) => {
  try {
    const { year, month } = req.params;

    // Fetch user from DB to get name/email (JWT only has id + accessLevel)
    const user = await User.findById(req.user.id).select("name email").lean();
    if (!user) return res.status(404).json({ msg: "User not found" });

    const report = await buildReport(
      req.user.id,
      parseInt(year),
      parseInt(month),
    );
    res.json({
      user: { name: user.name, email: user.email },
      year,
      month,
      ...report,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET /api/reports/admin/:userId/:year/:month — admin report for any user
router.get("/admin/:userId/:year/:month", [auth, admin], async (req, res) => {
  try {
    const { userId, year, month } = req.params;

    const user = await User.findById(userId).select("-password").lean();
    if (!user) return res.status(404).json({ msg: "User not found" });

    const report = await buildReport(userId, parseInt(year), parseInt(month));
    res.json({
      user: { name: user.name, email: user.email },
      year,
      month,
      ...report,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
