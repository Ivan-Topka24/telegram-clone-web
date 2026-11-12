/**
 * Contract for pushing real-time events to connected user sessions.
 */
class IRealtimeNotifier {
  /**
   * Sends a real-time event payload to all active connections of a single user.
   * @param {string} userId
   * @param {string} event
   * @param {any} payload
   */
  notifyUser(userId, event, payload) {
    throw new Error('Not implemented');
  }

  /**
   * Broadcasts a real-time event payload to all active connections of multiple users.
   * @param {string[]} userIds
   * @param {string} event
   * @param {any} payload
   */
  notifyUsers(userIds, event, payload) {
    throw new Error('Not implemented');
  }
}

module.exports = IRealtimeNotifier;
