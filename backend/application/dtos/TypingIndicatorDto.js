/**
 * Application DTO representing a transient user typing event in a chat.
 */
class TypingIndicatorDto {
  /**
   * @param {object} params
   * @param {string} params.chatId
   * @param {string} params.userId
   * @param {string} params.username
   */
  constructor({ chatId, userId, username }) {
    this.chatId = chatId;
    this.userId = userId;
    this.username = username;
  }
}

module.exports = TypingIndicatorDto;
