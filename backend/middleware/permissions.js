// middleware/permissions.js

const ADMIN_ROLES = ["super-admin", "admin"];

/**
 * Role definitions based on actual accessLevel values used in the DB.
 * Full set supported: super-admin, admin, manager, project-manager, senior, tech, entry, hr
 *
 * Permission actions: read | create | update | delete | approve | reject
 */
const PERMISSIONS = {
  // ── HR role ───────────────────────────────────────────────────────────────
  // Read-only across all modules; approve/reject on reimbursements;
  // read performance data for all employees.
  hr: {
    projects: ["read"],
    tasks: ["read"],
    activities: ["read"],
    reimbursements: ["read", "approve", "reject"],
    reports: ["read"],
    users: ["read"],
    performance: ["read"],
  },

  // ── Manager-level roles ───────────────────────────────────────────────────
  manager: {
    projects: ["read", "create", "update"],
    tasks: ["read", "create", "update", "delete"],
    activities: ["read", "create", "update", "delete"],
    reimbursements: ["read", "create", "update"],
    reports: ["read"],
    users: ["read"],
  },

  "project-manager": {
    projects: ["read", "create", "update"],
    tasks: ["read", "create", "update", "delete"],
    activities: ["read", "create", "update", "delete"],
    reimbursements: ["read", "create", "update"],
    reports: ["read"],
    users: ["read"],
  },

  // ── Tech / Senior roles ───────────────────────────────────────────────────
  tech: {
    projects: ["read"],
    tasks: ["read", "create", "update", "delete"],
    activities: ["read", "create", "update"],
    reimbursements: ["read", "create"],
    reports: ["read"],
    users: ["read"],
  },

  senior: {
    projects: ["read"],
    tasks: ["read", "create", "update"],
    activities: ["read", "create", "update"],
    reimbursements: ["read", "create"],
    reports: ["read"],
    users: ["read"],
  },

  // ── Entry-level role ──────────────────────────────────────────────────────
  entry: {
    projects: ["read"],
    tasks: ["read", "update"],
    activities: ["read", "create", "update"],
    reimbursements: ["read", "create"],
    reports: ["read"],
    users: [],
  },
};

/**
 * Core permission check.
 * Admins bypass all checks.
 * All other roles are looked up in the PERMISSIONS table above.
 * Unknown roles get NO permissions — logged as a warning so you can add them.
 */
const hasPermission = (user, module, action) => {
  if (!user) return false;

  // Admins always pass
  if (ADMIN_ROLES.includes(user.accessLevel)) return true;

  const rolePerms = PERMISSIONS[user.accessLevel];
  if (!rolePerms) {
    console.warn(
      `[permissions] Unknown accessLevel: "${user.accessLevel}" — denying ${action} on ${module}`,
    );
    return false;
  }

  return (rolePerms[module] || []).includes(action);
};

/**
 * Express middleware factory.
 * Usage: router.get('/path', auth, can('projects', 'read'), handler)
 *
 * HR-specific examples:
 *   router.patch('/reimbursements/:id/approve', auth, can('reimbursements', 'approve'), handler)
 *   router.patch('/reimbursements/:id/reject',  auth, can('reimbursements', 'reject'),  handler)
 *   router.get('/performance',                  auth, can('performance', 'read'),       handler)
 */
const can = (module, action) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ msg: "Unauthorized" });
  if (hasPermission(req.user, module, action)) return next();
  res.status(403).json({ msg: `Missing ${action} on ${module}` });
};

module.exports = { hasPermission, can, ADMIN_ROLES, PERMISSIONS };
