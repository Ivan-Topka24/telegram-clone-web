/**
 * Client-side model representing a transient typing indicator.
 */
export class TypingIndicatorModel {
  /**
   * @param {object} params
   * @param {string} params.chatId
   * @param {string} params.userId
   * @param {string} params.username
   */
  constructor({ chatId, userId, username }) {
    this.chatId = String(chatId);
    this.userId = String(userId);
    this.username = username;
  }
}
