/**
 * Applies baseline HTTP security headers to all Express responses.
 * @returns {import('express').RequestHandler}
 */
function createSecurityHeadersMiddleware() {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'"
    );
    next();
  };
}

module.exports = createSecurityHeadersMiddleware;
