const DomainException = require('./DomainException');

/**
 * Thrown when authentication is missing, invalid, or expired.
 */
class UnauthorizedException extends DomainException {
  /**
   * @param {string} [message='Unauthorized']
   * @param {string} [code='UNAUTHORIZED']
   */
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

module.exports = UnauthorizedException;
