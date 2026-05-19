// routes/admin.js

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const TimeEntry = require("../models/TimeEntry");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

// GET /api/admin/employees — all non-admin users
router.get("/employees", [auth, admin], async (req, res) => {
  try {
    // Fixed: was filter by role:'employee' but schema uses accessLevel
    const employees = await User.find({
      accessLevel: { $nin: ["admin", "super-admin"] },
    })
      .select("-password")
      .sort({ name: 1 });
    res.json(employees);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET /api/admin/report/:userId/:year/:month
router.get("/report/:userId/:year/:month", [auth, admin], async (req, res) => {
  try {
    const { userId, year, month } = req.params;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ msg: "User not found" });

    const entries = await TimeEntry.find({
      user: userId,
      date: { $gte: startDate, $lte: endDate },
    })
      .populate("project", "name client")
      .sort({ date: 1 });

    const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
    const projectBreakdown = {};
    entries.forEach((e) => {
      const pName = e.project?.name || "Unknown";
      projectBreakdown[pName] = (projectBreakdown[pName] || 0) + e.hours;
    });

    res.json({
      user: { name: user.name, email: user.email },
      year,
      month,
      entries,
      summary: { totalHours, totalEntries: entries.length, projectBreakdown },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
