/**
 * Fixed-window rate limiter. The counters live in a `store` with one method:
 *   hit(key, windowMs) → Promise<{ count, resetAt }>
 * Locally that's memory; on Vercel (many short-lived instances) it's the
 * `rate_limits` table in Postgres, so every instance sees the same counts.
 */
export function rateLimit({ store, windowMs, max, keyPrefix, key = (req) => req.ip, message }) {
  return async function rateLimitMiddleware(req, res, next) {
    try {
      const { count, resetAt } = await store.hit(`${keyPrefix}:${key(req)}`, windowMs);

      if (count > max) {
        const retryAfter = Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000));
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ success: false, message });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/** In-memory store for a single long-running process (local dev, tests). */
export function createMemoryRateStore() {
  const hits = new Map();
  let lastSweep = Date.now();

  return {
    async hit(key, windowMs) {
      const now = Date.now();

      if (now - lastSweep > 60_000) {
        for (const [k, entry] of hits) {
          if (entry.resetAt <= now) hits.delete(k);
        }
        lastSweep = now;
      }

      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;

      return { count: entry.count, resetAt: entry.resetAt };
    },
  };
}
