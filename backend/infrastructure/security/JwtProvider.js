const jwt = require('jsonwebtoken');
const { UnauthorizedException } = require('../../domain/exceptions');

/**
 * Generates and verifies JSON Web Tokens for stateless authentication.
 */
class JwtProvider {
  /**
   * @param {object} config
   * @param {string} config.secret
   * @param {string|number} [config.expiresIn='7d']
   */
  constructor({ secret, expiresIn = '7d' }) {
    if (!secret) {
      throw new Error('JwtProvider requires a signing secret');
    }
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  /**
   * Signs a JWT containing the user's identity claims.
   * @param {{ userId: string, username: string }} payload
   * @returns {string}
   */
  generateToken({ userId, username }) {
    return jwt.sign(
      { userId: String(userId), username },
      this.secret,
      { expiresIn: this.expiresIn }
    );
  }

  /**
   * Verifies a JWT and returns its decoded payload.
   * @param {string} token
   * @returns {{ userId: string, username: string, iat?: number, exp?: number }}
   * @throws {UnauthorizedException}
   */
  verifyToken(token) {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Authentication token is missing', 'INVALID_TOKEN');
    }

    try {
      return jwt.verify(token, this.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Authentication token has expired', 'TOKEN_EXPIRED');
      }
      throw new UnauthorizedException('Invalid authentication token', 'INVALID_TOKEN');
    }
  }
}

module.exports = JwtProvider;
