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

// 2) CORS — locked to known origins instead of the previous wide-open cors().
//    CLIENT_ORIGIN can be a comma-separated list (prod + staging + localhost).
//    Falls back to localhost dev ports if the env var is unset.
const allowedOrigins = (
  process.env.CLIENT_ORIGIN || "http://localhost:5173,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / server-to-server / curl (no Origin header)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-auth-token", "Authorization"],
  }),
);

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
