/**
 * Domain entity representing a single message within a chat.
 */
class Message {
  /**
   * @param {object} params
   * @param {string|null} [params.id=null]
   * @param {string} params.chatId
   * @param {string} params.senderId
   * @param {string} params.text
   * @param {Date|string|null} [params.createdAt=null]
   */
  constructor({ id = null, chatId, senderId, text, createdAt = null }) {
    this.id = id ? String(id) : null;
    this.chatId = String(chatId);
    this.senderId = String(senderId);
    this.text = text;
    this.createdAt = createdAt ? new Date(createdAt) : null;
  }
}

module.exports = Message;
