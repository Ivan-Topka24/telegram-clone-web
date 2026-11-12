const DomainException = require('./DomainException');

/**
 * Thrown when a requested domain entity does not exist.
 */
class NotFoundException extends DomainException {
  /**
   * @param {string} [message='Resource not found']
   * @param {string} [code='NOT_FOUND']
   */
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

module.exports = NotFoundException;
