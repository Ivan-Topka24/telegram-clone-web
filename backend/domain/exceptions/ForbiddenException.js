const DomainException = require('./DomainException');

/**
 * Thrown when an authenticated user lacks permission for an action.
 */
class ForbiddenException extends DomainException {
  /**
   * @param {string} [message='Forbidden']
   * @param {string} [code='FORBIDDEN']
   */
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

module.exports = ForbiddenException;
