/**
 * scripts/migrateTaskNumbers.js
 * ─────────────────────────────
 * One-time backfill: assigns sequential taskNumbers to every existing Task
 * document that does not yet have one, ordered by createdAt ascending so the
 * oldest task gets #1.
 *
 * Run ONCE after deploying the updated Task model and Counter model:
 *
 *   MONGODB_URI=<your-uri> node scripts/migrateTaskNumbers.js
 *
 * Safe to re-run — it skips tasks that already have a taskNumber.
 * After the script completes the Counter will reflect the true current maximum
 * so new tasks continue from the right number.
 */

"use strict";

const mongoose = require("mongoose");
const Task = require("../models/Task");
const { Counter } = require("../models/Counter");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI env var is required.");
  process.exit(1);
}

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅  Connected to MongoDB.");

  // ── Find all tasks without a taskNumber, oldest first ──────────────────────
  const tasks = await Task.find({ taskNumber: { $exists: false } })
    .select("_id createdAt")
    .sort({ createdAt: 1 })
    .lean();

  if (tasks.length === 0) {
    console.log(
      "ℹ️   No tasks to migrate — all tasks already have a taskNumber.",
    );
    await mongoose.disconnect();
    return;
  }

  console.log(`📋  Found ${tasks.length} task(s) without a taskNumber.`);

  // ── Find the current counter maximum so we don't overlap new tasks ─────────
  const existingCounter = await Counter.findById("taskNumber").lean();
  let seq = existingCounter?.seq ?? 0;

  // Also check the actual max in the Task collection in case it's ahead of the
  // counter (e.g. from a previous partial migration).
  const maxInCollection = await Task.findOne({ taskNumber: { $exists: true } })
    .sort({ taskNumber: -1 })
    .select("taskNumber")
    .lean();

  if (maxInCollection && maxInCollection.taskNumber > seq) {
    seq = maxInCollection.taskNumber;
  }

  console.log(`🔢  Starting sequence from: ${seq + 1}`);

  // ── Bulk update using individual saves (safe, no duplicate key risk) ───────
  let migrated = 0;
  for (const { _id } of tasks) {
    seq++;
    await Task.updateOne({ _id }, { $set: { taskNumber: seq } });
    migrated++;
    if (migrated % 50 === 0) process.stdout.write(`   …${migrated} done\n`);
  }

  // ── Persist the counter so new tasks continue from here ───────────────────
  await Counter.findOneAndUpdate(
    { _id: "taskNumber" },
    { $set: { seq } },
    { upsert: true },
  );

  console.log(
    `\n✅  Migration complete. ${migrated} task(s) numbered. Counter set to ${seq}.`,
  );
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("❌  Migration failed:", err);
  process.exit(1);
});
