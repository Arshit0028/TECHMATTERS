// server.js
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const rateLimit = require("./middleware/rateLimit");

const app = express();

/* ============================================================
   SECURITY & PLATFORM MIDDLEWARE
   ------------------------------------------------------------
   Order matters: security headers first, then CORS, then body
   parsing, then logging. None of this changes route behaviour.
============================================================ */

// 1) Secure HTTP headers. crossOriginResourcePolicy is relaxed so the
//    /api/uploads static files can still be embedded by the frontend origin.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// 2) CORS — allow known origins. CLIENT_ORIGIN can be a comma-separated list
//    (prod + staging + localhost). The defaults below mean it works even if the
//    env var is never set on Render.
//
//    IMPORTANT: when an origin is NOT allowed we call callback(null, false)
//    (a clean CORS denial). We must NEVER throw here — throwing turns the
//    preflight OPTIONS request into a 500, which is what blocked login.
const allowedOrigins = (
  process.env.CLIENT_ORIGIN ||
  [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://techmatters-blue.vercel.app", // production frontend (Vercel)
    "https://techmatters.onrender.com", // backend host (same-origin calls)
  ].join(",")
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (allowedOrigins.includes(origin)) return true;
  // Safety net: allow Vercel + Render subdomains (covers preview/branch deploys
  // like techmatters-blue-git-xyz.vercel.app without listing each one).
  try {
    const host = new URL(origin).hostname;
    if (host.endsWith(".vercel.app")) return true;
    if (host === "onrender.com" || host.endsWith(".onrender.com")) return true;
  } catch {
    /* malformed origin → not allowed */
  }
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    // No Origin header = same-origin / server-to-server / curl → allow.
    if (!origin) return callback(null, true);
    // Allowed → reflect the origin. Not allowed → clean denial (NEVER throw).
    return callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-auth-token", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Explicitly answer every preflight so OPTIONS never falls through to a route
// (or the error handler) and 500s.
app.options("*", cors(corsOptions));

// 3) Body parsing with an explicit size cap (prevents oversized-payload abuse).
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// 4) Request logging — concise in prod, verbose in dev.
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// 5) Static uploads (unchanged path; headers already handled by helmet above).
app.use("/api/uploads", express.static("uploads"));

/* ============================================================
   RATE LIMITING
   ------------------------------------------------------------
   Auth endpoints get a tight limit (brute-force protection);
   the rest of the API gets a generous global limit.
============================================================ */
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 300 }));

/* ============================================================
   ROUTES  (unchanged — same mounts, same order)
============================================================ */
// Root — gives a friendly response instead of "Cannot GET /".
// Useful for uptime probes (Render/Railway/etc.) that ping the base URL.
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

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/projects", require("./routes/projects"));
app.use("/api/tasks", require("./routes/task"));
app.use("/api/activities", require("./routes/activities"));
app.use("/api/reimbursements", require("./routes/reimbursements"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/time-entries", require("./routes/timeEntries"));
app.use("/api/performance", require("./routes/performance"));
app.use("/api/monthly-reports", require("./routes/monthlyReports"));

/* ============================================================
   404 — unknown route (must come AFTER all routes, BEFORE the
   error handler). Returns JSON so API clients get a consistent shape.
============================================================ */
app.use((req, res) => {
  res
    .status(404)
    .json({ msg: `Route not found: ${req.method} ${req.originalUrl}` });
});

/* ============================================================
   CENTRAL ERROR HANDLER
   ------------------------------------------------------------
   Catches thrown errors (incl. CORS rejections) so the process
   never leaks stack traces to clients in production.
============================================================ */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (process.env.NODE_ENV !== "production") {
    console.error(err);
  }
  res.status(status).json({
    msg:
      status === 500
        ? "Server error"
        : err.message || "Request could not be processed",
  });
});

/* ============================================================
   DATABASE + SERVER BOOT
   ------------------------------------------------------------
   Connect to Mongo BEFORE listening so the server never accepts
   traffic it can't serve. Indexes are built in the background.
============================================================ */
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

// Surface unexpected failures instead of dying silently.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
