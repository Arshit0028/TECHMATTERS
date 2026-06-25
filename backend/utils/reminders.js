// utils/reminders.js
const Activity = require("../models/Activity");
const Notification = require("../models/Notification");
const { getLocalDateParts } = require("./dateHelpers");

/**
 * Ensures today's reminder notifications exist for a given user's
 * Daily/Weekly activities. Safe to call on every notifications fetch —
 * it's idempotent (relies on the unique partial index on Notification:
 * one "activity_reminder" per activity per dateKey) and cheap (scoped to
 * one user's non-completed Daily/Weekly activities).
 *
 * This runs lazily (on request) rather than on a server-side cron because
 * Render's free tier sleeps the process after ~15 min idle — a fixed-time
 * cron would silently miss days whenever the dyno happens to be asleep.
 * Generating on-demand means the reminder simply appears the next time the
 * user (or their navbar's polling) hits the API, whatever time that is.
 */
async function ensureTodayReminders(userId) {
  const { dateKey, weekdayShort } = getLocalDateParts();

  const activities = await Activity.find({
    assignee: userId,
    status: { $ne: "Completed" },
    activityType: { $in: ["Daily", "Weekly"] },
  }).select("name activityType assignee startDate endDate reminderDays");

  for (const act of activities) {
    let due = false;

    if (act.activityType === "Daily") {
      due = true;
    } else if (act.activityType === "Weekly") {
      const days = act.reminderDays || [];
      const matchesDay = days.includes(weekdayShort);

      const afterStart =
        !act.startDate || new Date() >= new Date(act.startDate);
      const beforeEnd =
        !act.endDate ||
        new Date() <= new Date(new Date(act.endDate).setHours(23, 59, 59, 999));

      due = matchesDay && afterStart && beforeEnd;
    }

    if (!due) continue;

    try {
      await Notification.create({
        recipient: act.assignee,
        activity: act._id,
        type: "activity_reminder",
        title: `Reminder: ${act.name}`,
        message:
          act.activityType === "Daily"
            ? `Don't forget to complete "${act.name}" today.`
            : `"${act.name}" is scheduled for today (${weekdayShort}). Please complete it.`,
        dateKey,
      });
    } catch (err) {
      // 11000 = duplicate key = today's reminder already exists. Expected
      // and harmless (e.g. two browser tabs polling at once).
      if (err.code !== 11000) {
        console.error("Reminder creation failed for activity", act._id, err);
      }
    }
  }
}

module.exports = { ensureTodayReminders };
