const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

/**
 * Wraps bcrypt password hashing and verification.
 */
class PasswordHasher {
  /**
   * Hashes a plain-text password using bcrypt.
   * @param {string} plainPassword
   * @returns {Promise<string>}
   */
  async hash(plainPassword) {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  /**
   * Compares a plain-text password against a stored bcrypt hash.
   * @param {string} plainPassword
   * @param {string} passwordHash
   * @returns {Promise<boolean>}
   */
  async compare(plainPassword, passwordHash) {
    if (!plainPassword || !passwordHash) {
      return false;
    }
    return bcrypt.compare(plainPassword, passwordHash);
  }
}

module.exports = PasswordHasher;
