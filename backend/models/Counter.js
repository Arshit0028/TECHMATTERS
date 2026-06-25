/**
 * Counter model — production-safe atomic sequence generator.
 *
 * Usage:
 *   const { nextSeq } = require('./Counter');
 *   const taskNumber = await nextSeq('taskNumber');  // → 1, 2, 3 …
 *
 * Pattern: findOneAndUpdate + $inc + upsert is the canonical MongoDB approach
 * for auto-increment. It is atomic even under high-concurrency writes because
 * the server-side $inc is a single document operation with no intermediate read.
 */

const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // entity name, e.g. "taskNumber"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", CounterSchema);

/**
 * nextSeq — atomically increments and returns the next value for `name`.
 * Creates the counter document on first call (upsert).
 *
 * @param  {string} name  — counter key, e.g. "taskNumber"
 * @returns {Promise<number>}
 */
const nextSeq = async (name) => {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return doc.seq;
};

module.exports = { Counter, nextSeq };
