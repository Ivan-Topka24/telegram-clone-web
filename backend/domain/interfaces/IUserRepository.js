/**
 * Contract for user persistence operations.
 */
class IUserRepository {
  /**
   * Persists a new user record.
   * @param {object} userData
   * @returns {Promise<import('../models/User')>}
   */
  async create(userData) {
    throw new Error('Not implemented');
  }

  /**
   * Finds a user by unique identifier.
   * @param {string} id
   * @returns {Promise<import('../models/User')|null>}
   */
  async findById(id) {
    throw new Error('Not implemented');
  }

  /**
   * Finds multiple users by their identifiers.
   * @param {string[]} ids
   * @returns {Promise<Array<import('../models/User')>>}
   */
  async findByIds(ids) {
    throw new Error('Not implemented');
  }

  /**
   * Finds a user by exact username.
   * @param {string} username
   * @returns {Promise<import('../models/User')|null>}
   */
  async findByUsername(username) {
    throw new Error('Not implemented');
  }

  /**
   * Searches users whose username starts with the given prefix.
   * @param {string} query
   * @param {string} excludeUserId
   * @param {number} [limit=10]
   * @returns {Promise<Array<import('../models/User')>>}
   */
  async searchByUsernamePrefix(query, excludeUserId, limit = 10) {
    throw new Error('Not implemented');
  }
}

module.exports = IUserRepository;
