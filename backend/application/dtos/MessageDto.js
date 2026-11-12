/**
 * Application DTO representing a chat message enriched with sender display name.
 */
class MessageDto {
  /**
   * @param {object} params
   * @param {string|null} params.id
   * @param {string} params.chatId
   * @param {string} params.senderId
   * @param {string} params.senderName
   * @param {string} params.text
   * @param {Date|string|null} [params.createdAt=null]
   */
  constructor({ id, chatId, senderId, senderName, text, createdAt = null }) {
    this.id = id ?? null;
    this.chatId = chatId;
    this.senderId = senderId;
    this.senderName = senderName;
    this.text = text;
    this.createdAt = createdAt ?? null;
  }
}

module.exports = MessageDto;
