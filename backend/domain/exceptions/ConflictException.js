const DomainException = require('./DomainException');

/**
 * Thrown when an operation conflicts with existing persisted state (e.g. concurrent duplicate creation).
 */
class ConflictException extends DomainException {
  /**
   * @param {string} [message='Resource conflict']
   * @param {string} [code='CONFLICT']
   */
  constructor(message = 'Resource conflict', code = 'CONFLICT') {
    super(message, 409, code);
  }
}

module.exports = ConflictException;
