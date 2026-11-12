const { UnauthorizedException } = require('../../../domain/exceptions');

/**
 * Creates Express middleware that authenticates Bearer JWT tokens.
 * @param {{ verifyToken: Function }} jwtProvider
 * @returns {import('express').RequestHandler}
 */
function createAuthMiddleware(jwtProvider) {
  return (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      return next(
        new UnauthorizedException('Missing Authorization header', 'MISSING_AUTH_HEADER')
      );
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(
        new UnauthorizedException('Invalid Authorization header format', 'INVALID_AUTH_HEADER')
      );
    }

    try {
      const payload = jwtProvider.verifyToken(token);
      req.user = {
        id: String(payload.userId),
        username: payload.username,
      };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = createAuthMiddleware;
