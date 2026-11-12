const DomainException = require('./DomainException');

/**
 * Thrown when input data fails domain or application validation rules.
 */
class ValidationException extends DomainException {
  /**
   * @param {string} [message='Validation failed']
   * @param {string} [code='VALIDATION_ERROR']
   */
  constructor(message = 'Validation failed', code = 'VALIDATION_ERROR') {
    super(message, 400, code);
  }
}

module.exports = ValidationException;
