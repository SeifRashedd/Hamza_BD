/**
 * Tiny in-memory fixed-window rate limiter. Good enough for a single-process
 * microsite; swap for a shared store if this ever runs on several instances.
 */
export function rateLimit({ windowMs, max, keyPrefix, key = (req) => req.ip, message }) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(k);
    }
  }, Math.min(windowMs, 60_000));
  sweep.unref();

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const id = `${keyPrefix}:${key(req)}`;
    let entry = hits.get(id);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(id, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message });
    }

    next();
  };
}
