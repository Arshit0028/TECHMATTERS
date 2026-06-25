require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const rateLimit = require("./middleware/rateLimit");

const app = express();

/* ── Security headers ────────────────────────────────────────────────────── */
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

/* ── CORS ─────────────────────────────────────────────────────────────────── */
const allowedOrigins = (
  process.env.CLIENT_ORIGIN ||
  [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://techmatters-blue.vercel.app",
    "https://techmatters.onrender.com",
  ].join(",")
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (allowedOrigins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    if (host.endsWith(".vercel.app")) return true;
    if (host === "onrender.com" || host.endsWith(".onrender.com")) return true;
  } catch {
    /* malformed */
  }
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-auth-token", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ── Body parsing ─────────────────────────────────────────────────────────── */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

/* ── Logging ──────────────────────────────────────────────────────────────── */
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

/* ── Keep-alive / uptime ping ─────────────────────────────────────────────── */
// Lightweight, unauthenticated, NOT rate-limited (declared before the limiters).
// Point UptimeRobot / cron-job.org at https://techmatters.onrender.com/health
// every ~10 min to prevent Render free-tier cold starts.
app.get("/health", (req, res) => res.status(200).send("ok"));

/* ── Static uploads ───────────────────────────────────────────────────────── */
app.use("/api/uploads", express.static("uploads"));

/* ── Rate limiting ────────────────────────────────────────────────────────── */
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 300 }));

/* ── Health / root ────────────────────────────────────────────────────────── */
app.get("/", (req, res) =>
  res.json({
    service: "TechMatters Workforce API",
    status: "ok",
    docs: "All endpoints are under /api",
  }),
);
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", uptime: process.uptime() }),
);

/* ── Routes ───────────────────────────────────────────────────────────────── */

// ── Existing routes — completely untouched ──────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/projects", require("./routes/projects"));
app.use("/api/tasks", require("./routes/task")); // ← original, no approval logic
app.use("/api/activities", require("./routes/activities"));
app.use("/api/reimbursements", require("./routes/reimbursements"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/time-entries", require("./routes/timeEntries"));
app.use("/api/performance", require("./routes/performance"));
app.use("/api/monthly-reports", require("./routes/monthlyReports"));

// ── New: peer assignment system — completely separate from /api/tasks ───────
// AssignedTask has its own model, collection, and routes.
// The regular Tasks page never sees these records.
app.use("/api/assigned-tasks", require("./routes/assignedTasks")); // ← NEW

// ── New: activity notifications — navbar bell ────────────────────────────────
// Fires a notification when an activity is created, and lazily generates
// today's reminder for Daily/Weekly activities the moment this route is
// hit (see utils/reminders.js for why this is lazy rather than cron-based —
// short version: Render free tier sleeps the process, so a fixed-time cron
// can't be trusted to fire).
app.use("/api/notifications", require("./routes/notifications")); // ← NEW

/* ── 404 ──────────────────────────────────────────────────────────────────── */
app.use((req, res) => {
  res
    .status(404)
    .json({ msg: `Route not found: ${req.method} ${req.originalUrl}` });
});

/* ── Error handler ────────────────────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (process.env.NODE_ENV !== "production") console.error(err);
  res.status(status).json({
    msg:
      status === 500
        ? "Server error"
        : err.message || "Request could not be processed",
  });
});

/* ── DB + boot ────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 5000;
mongoose.set("strictQuery", true);
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

process.on("unhandledRejection", (reason) =>
  console.error("Unhandled rejection:", reason),
);
