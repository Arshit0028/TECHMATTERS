// routes/auth.js

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: "User already exists" });

    user = new User({ name, email, password, accessLevel: role || "entry" });
    await user.save();

    const payload = { user: { id: user.id, accessLevel: user.accessLevel } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            _id: user._id, // ← frontend keys everything on _id (matches /me)
            id: user.id, // kept for backward compatibility
            name: user.name,
            email: user.email,
            accessLevel: user.accessLevel,
            reportingManager: user.reportingManager,
            permissions: user.permissions,
          },
        });
      },
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

    // Check if account is active
    if (user.status === "inactive") {
      return res
        .status(403)
        .json({ msg: "Account is deactivated. Contact your administrator." });
    }

    const payload = { user: { id: user.id, accessLevel: user.accessLevel } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            _id: user._id, // ← frontend keys everything on _id (matches /me)
            id: user.id, // kept for backward compatibility
            name: user.name,
            email: user.email,
            accessLevel: user.accessLevel,
            reportingManager: user.reportingManager,
            permissions: user.permissions,
          },
        });
      },
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET /api/auth/me
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
