// server.js

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/uploads", express.static("uploads"));

// ── Routes ────────────────────────────────────────────────────────────────────
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

// ── DB ────────────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
