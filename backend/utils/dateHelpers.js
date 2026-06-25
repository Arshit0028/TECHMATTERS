// utils/dateHelpers.js
//
// Render's servers run in UTC. The team is IST, so "today" and "which
// weekday is it" need to be computed in local time, or reminders can fire
// (or fail to fire) up to ~5.5 hours off from what people actually expect.
//
// If your team isn't in India, change TIMEZONE below — everything else
// (dateKey generation, weekday matching) follows from this one constant.

const TIMEZONE = "Asia/Kolkata";

// Matches the short-day values stored in Activity.reminderDays.
const WEEKDAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Returns { dateKey, weekdayShort } for the given date, computed in
 * TIMEZONE. dateKey is "YYYY-MM-DD" (local), weekdayShort is one of
 * WEEKDAY_ORDER (local).
 */
function getLocalDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = fmt.formatToParts(date);
  const map = {};
  parts.forEach((p) => {
    map[p.type] = p.value;
  });

  const dateKey = `${map.year}-${map.month}-${map.day}`;
  // en-CA gives weekday values like "Mon", "Tue" — already matches our enum.
  const weekdayShort = map.weekday;

  return { dateKey, weekdayShort };
}

module.exports = { TIMEZONE, WEEKDAY_ORDER, getLocalDateParts };
