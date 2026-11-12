const IConnectionManager = require('../../domain/interfaces/IConnectionManager');

/**
 * Tracks active WebSocket connections per userId to support multiple concurrent tabs/sessions.
 */
class ConnectionManager extends IConnectionManager {
  constructor() {
    super();
    /** @type {Map<string, Set<import('ws')>>} */
    this.connections = new Map();
  }

  /**
   * Registers an active WebSocket connection for a user.
   * @param {string} userId
   * @param {import('ws')} ws
   */
  addConnection(userId, ws) {
    const key = String(userId);
    if (!this.connections.has(key)) {
      this.connections.set(key, new Set());
    }
    this.connections.get(key).add(ws);
  }

  /**
   * Removes a WebSocket connection for a user and cleans up empty sets.
   * @param {string} userId
   * @param {import('ws')} ws
   */
  removeConnection(userId, ws) {
    const key = String(userId);
    const sockets = this.connections.get(key);
    if (!sockets) {
      return;
    }

    sockets.delete(ws);
    if (sockets.size === 0) {
      this.connections.delete(key);
    }
  }

  /**
   * Returns all registered WebSocket instances for a user.
   * @param {string} userId
   * @returns {Set<import('ws')>}
   */
  getConnections(userId) {
    return this.connections.get(String(userId)) || new Set();
  }

  /**
   * Returns true if the user currently has at least one active connection.
   * @param {string} userId
   * @returns {boolean}
   */
  isOnline(userId) {
    const sockets = this.connections.get(String(userId));
    return Boolean(sockets && sockets.size > 0);
  }
}

module.exports = ConnectionManager;
