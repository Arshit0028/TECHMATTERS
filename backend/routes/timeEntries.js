// routes/timeEntries.js

const express = require("express");
const router = express.Router();
const TimeEntry = require("../models/TimeEntry");
const auth = require("../middleware/auth");
const { ADMIN_ROLES } = require("../middleware/permissions");

// POST /api/time-entries
router.post("/", auth, async (req, res) => {
  try {
    const { project, date, hours, description, taskType } = req.body;
    const entry = new TimeEntry({
      user: req.user.id,
      project,
      date,
      hours,
      description,
      taskType,
    });
    await entry.save();
    res.json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET /api/time-entries/month/:year/:month — own entries only
router.get("/month/:year/:month", auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const entries = await TimeEntry.find({
      user: req.user.id,
      date: { $gte: startDate, $lte: endDate },
    })
      .populate("project", "name client")
      .sort({ date: 1 });

    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// PUT /api/time-entries/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ msg: "Entry not found" });

    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel); // Fixed: was req.user.role
    if (entry.user.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    const updated = await TimeEntry.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true },
    );
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// DELETE /api/time-entries/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ msg: "Entry not found" });

    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel); // Fixed: was req.user.role
    if (entry.user.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    await entry.deleteOne();
    res.json({ msg: "Entry removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
