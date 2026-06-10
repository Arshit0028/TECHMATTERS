// middleware/rateLimit.js
//
// Lightweight, dependency-free in-memory rate limiter.
//
// Why in-house instead of express-rate-limit?
//   - Zero new dependencies to vet/install.
//   - Sufficient for a single-instance deployment (the common case here).
//
// PRODUCTION NOTE: in-memory counters are per-process. If you scale to
// multiple instances / dynos / pods behind a load balancer, swap this for
// `express-rate-limit` backed by a shared Redis store so limits are global.
// The call sites in server.js stay identical — only this file changes.

module.exports = function rateLimit({ windowMs = 60_000, max = 300 } = {}) {
  // Map<ip, { count, resetAt }>
  const hits = new Map();

  // Periodically purge expired buckets so the Map can't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of hits) {
      if (rec.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  // Don't keep the event loop alive just for the sweeper.
  if (sweep.unref) sweep.unref();

  return function (req, res, next) {
    // Trust the first X-Forwarded-For hop if present (behind a proxy),
    // otherwise fall back to the socket address.
    const fwd = req.headers["x-forwarded-for"];
    const ip =
      (typeof fwd === "string" && fwd.split(",")[0].trim()) ||
      req.ip ||
      req.connection?.remoteAddress ||
      "unknown";

    const now = Date.now();
    let rec = hits.get(ip);

    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(ip, rec);
    }

    rec.count += 1;

    const remaining = Math.max(0, max - rec.count);
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(rec.resetAt / 1000));

    if (rec.count > max) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res
        .status(429)
        .json({ msg: "Too many requests. Please try again shortly." });
    }

    next();
  };
};
