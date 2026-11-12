/**
 * Base class for all domain-level business exceptions.
 */
class DomainException extends Error {
  /**
   * @param {string} message - Human-readable error message.
   * @param {number} [statusCode=500] - Associated HTTP status code.
   * @param {string} [code='DOMAIN_ERROR'] - Machine-readable error code.
   */
  constructor(message, statusCode = 500, code = 'DOMAIN_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = DomainException;
