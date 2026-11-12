/**
 * Creates a lightweight in-memory fixed-window rate limiter middleware.
 * @param {object} [options]
 * @param {number} [options.windowMs=60000]
 * @param {number} [options.maxRequests=30]
 * @param {() => boolean} [options.skip]
 * @returns {import('express').RequestHandler & { reset: () => void }}
 */
function createRateLimitMiddleware({
  windowMs = 60_000,
  maxRequests = 30,
  skip = () => false,
} = {}) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();

  const middleware = (req, res, next) => {
    if (skip(req)) {
      return next();
    }

    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const existing = hits.get(key);

    if (!existing || now >= existing.resetAt) {
      if (hits.size > 5000) {
        for (const [entryKey, entry] of hits.entries()) {
          if (now >= entry.resetAt) {
            hits.delete(entryKey);
          }
        }
      }
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        },
      });
    }

    return next();
  };

  middleware.reset = () => hits.clear();
  return middleware;
}

module.exports = createRateLimitMiddleware;
