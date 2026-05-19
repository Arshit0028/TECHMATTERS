// routes/users.js

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const fs = require("fs");
const User = require("../models/User");
const upload = require("../middleware/upload");
const auth = require("../middleware/auth");
const { can, ADMIN_ROLES } = require("../middleware/permissions");

// Ensure upload directory exists
if (!fs.existsSync("uploads/resumes")) {
  fs.mkdirSync("uploads/resumes", { recursive: true });
}

// GET /api/users — admins see all; others see only active users (for dropdowns/team lists)
router.get("/", [auth, can("users", "read")], async (req, res) => {
  try {
    const isAdmin = ADMIN_ROLES.includes(req.user.accessLevel);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (!isAdmin) filter.status = "active"; // non-admins only see active users
    if (req.query.role) filter.accessLevel = req.query.role;
    if (req.query.status && isAdmin) filter.status = req.query.status; // admins can filter by status

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select("-password")
      .populate("reportingManager", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET /api/users/team — returns active users for team assignment dropdowns
router.get("/team", auth, async (req, res) => {
  try {
    const users = await User.find({ status: "active" })
      .select("name email accessLevel")
      .sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

// GET /api/users/:id
router.get("/:id", [auth, can("users", "read")], async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("reportingManager", "name email");
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

// POST /api/users — admin only
router.post(
  "/",
  [auth, can("users", "create")],
  upload.single("resume"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        employeeId,
        joiningDate,
        phone,
        bio,
        department,
        designation,
        reportingManager,
        status,
        accessLevel,
        permissions,
      } = req.body;

      if (!name?.trim())
        return res.status(400).json({ msg: "Name is required" });
      if (!email?.trim())
        return res.status(400).json({ msg: "Email is required" });
      if (!password?.trim())
        return res.status(400).json({ msg: "Password is required" });

      const existing = await User.findOne({
        email: email.trim().toLowerCase(),
      });
      if (existing)
        return res.status(400).json({ msg: "Email already in use" });

      let parsedPermissions = [];
      if (permissions) {
        try {
          parsedPermissions = JSON.parse(permissions);
        } catch {
          /* ignore */
        }
      }

      const user = new User({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        employeeId: employeeId || undefined,
        joiningDate: joiningDate || Date.now(),
        phone: phone || "",
        bio: bio || "",
        department: department || "",
        designation: designation || "",
        reportingManager: reportingManager || null,
        status: status || "active",
        accessLevel: accessLevel || "entry",
        permissions: parsedPermissions,
        resume: req.file ? req.file.path : "",
      });

      await user.save();
      const userObj = user.toObject();
      delete userObj.password;
      res.status(201).json(userObj);
    } catch (err) {
      console.error("POST /api/users error:", err);
      if (err.code === 11000)
        return res
          .status(400)
          .json({ msg: "Employee ID or email already exists" });
      res.status(500).json({ msg: "Server error", detail: err.message });
    }
  },
);

// PUT /api/users/:id — admin only
router.put(
  "/:id",
  [auth, can("users", "update")],
  upload.single("resume"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        employeeId,
        joiningDate,
        phone,
        bio,
        department,
        designation,
        reportingManager,
        status,
        accessLevel,
        permissions,
      } = req.body;

      const updateData = {};
      if (name) updateData.name = name.trim();
      if (email) updateData.email = email.trim().toLowerCase();
      if (employeeId) updateData.employeeId = employeeId.trim();
      if (joiningDate) updateData.joiningDate = joiningDate;
      if (phone !== undefined) updateData.phone = phone;
      if (bio !== undefined) updateData.bio = bio;
      if (department) updateData.department = department;
      if (designation) updateData.designation = designation;
      if (reportingManager !== undefined)
        updateData.reportingManager = reportingManager || null;
      if (status) updateData.status = status;
      if (accessLevel) updateData.accessLevel = accessLevel;
      if (req.file) updateData.resume = req.file.path;

      if (permissions) {
        try {
          updateData.permissions = JSON.parse(permissions);
        } catch {
          /* ignore */
        }
      }

      if (password?.trim()) {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(password.trim(), salt);
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true, runValidators: true },
      )
        .select("-password")
        .populate("reportingManager", "name email");

      if (!user) return res.status(404).json({ msg: "User not found" });
      res.json(user);
    } catch (err) {
      console.error("PUT /api/users/:id error:", err);
      if (err.code === 11000)
        return res
          .status(400)
          .json({ msg: "Email or Employee ID already in use" });
      res.status(500).json({ msg: "Server error", detail: err.message });
    }
  },
);

// DELETE /api/users/:id — soft delete (admin only)
router.delete("/:id", [auth, can("users", "delete")], async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "inactive" } },
      { new: true },
    ).select("-password");
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json({ msg: "User deactivated", user });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
