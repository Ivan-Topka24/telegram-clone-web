const { UnauthorizedException } = require('../../../domain/exceptions');

const BEARER_HEADER_PATTERN = /^Bearer\s+(\S+)$/i;

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

    const match = BEARER_HEADER_PATTERN.exec(authHeader.trim());
    if (!match) {
      return next(
        new UnauthorizedException('Invalid Authorization header format', 'INVALID_AUTH_HEADER')
      );
    }

    const token = match[1];

    try {
      const payload = jwtProvider.verifyToken(token);
      if (!payload || !payload.userId) {
        return next(
          new UnauthorizedException('Invalid authentication token claims', 'INVALID_TOKEN')
        );
      }

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
