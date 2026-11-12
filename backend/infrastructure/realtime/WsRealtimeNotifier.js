const IRealtimeNotifier = require('../../domain/interfaces/IRealtimeNotifier');

const WS_OPEN_STATE = 1;

/**
 * WebSocket-backed implementation of IRealtimeNotifier.
 */
class WsRealtimeNotifier extends IRealtimeNotifier {
  /**
   * @param {import('./ConnectionManager')} connectionManager
   */
  constructor(connectionManager) {
    super();
    this.connectionManager = connectionManager;
  }

  /**
   * Sends an event payload to all open sockets of a single user.
   * @param {string} userId
   * @param {string} event
   * @param {any} payload
   */
  notifyUser(userId, event, payload) {
    this.notifyUsers([userId], event, payload);
  }

  /**
   * Serializes { event, payload } and pushes it to all open sockets of the target users.
   * @param {string[]} userIds
   * @param {string} event
   * @param {any} payload
   */
  notifyUsers(userIds, event, payload) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return;
    }

    const message = JSON.stringify({ event, payload });
    const uniqueUserIds = new Set(userIds.map((id) => String(id)));

    for (const userId of uniqueUserIds) {
      const sockets = this.connectionManager.getConnections(userId);
      for (const ws of sockets) {
        if (ws.readyState === WS_OPEN_STATE) {
          try {
            ws.send(message);
          } catch (_err) {
            // Ignore send errors on closing sockets; close handlers will prune them.
          }
        }
      }
    }
  }
}

module.exports = WsRealtimeNotifier;
