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
   * @param {string[]} [params.readBy=[]]
   * @param {Date|string|null} [params.createdAt=null]
   */
  constructor({ id, chatId, senderId, senderName, text, readBy = [], createdAt = null }) {
    this.id = id ?? null;
    this.chatId = chatId;
    this.senderId = senderId;
    this.senderName = senderName;
    this.text = text;
    this.readBy = Array.isArray(readBy) ? readBy.map(String) : [];
    this.createdAt = createdAt ?? null;
  }
}

module.exports = MessageDto;
