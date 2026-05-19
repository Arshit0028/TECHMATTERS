// middleware/admin.js

module.exports = (req, res, next) => {
  if (!req.user) return res.status(401).json({ msg: "Unauthorized" });
  if (
    req.user.accessLevel === "admin" ||
    req.user.accessLevel === "super-admin"
  ) {
    return next();
  }
  res.status(403).json({ msg: "Admin access required" });
};
