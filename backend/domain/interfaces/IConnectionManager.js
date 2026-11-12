/**
 * Contract for tracking active real-time connections per user.
 */
class IConnectionManager {
  /**
   * Registers an active connection for a user.
   * @param {string} userId
   * @param {any} connection
   */
  addConnection(userId, connection) {
    throw new Error('Not implemented');
  }

  /**
   * Removes an active connection for a user.
   * @param {string} userId
   * @param {any} connection
   */
  removeConnection(userId, connection) {
    throw new Error('Not implemented');
  }

  /**
   * Returns all active connections for a user.
   * @param {string} userId
   * @returns {Set<any>}
   */
  getConnections(userId) {
    throw new Error('Not implemented');
  }

  /**
   * Returns true if the user has at least one active connection.
   * @param {string} userId
   * @returns {boolean}
   */
  isOnline(userId) {
    throw new Error('Not implemented');
  }
}

module.exports = IConnectionManager;
