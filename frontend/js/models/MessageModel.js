/**
 * Outgoing WebSocket DTO for sending a chat message.
 */
export class SendMessageRequestDto {
  /**
   * @param {{ chatId: string, text: string }} params
   */
  constructor({ chatId, text }) {
    this.chatId = chatId;
    this.text = text;
  }
}

/**
 * Client-side domain/view model representing a chat message.
 */
export class MessageModel {
  /**
   * @param {object} params
   * @param {string|null} [params.id=null]
   * @param {string} params.chatId
   * @param {string} params.senderId
   * @param {string} [params.senderName='User']
   * @param {string} params.text
   * @param {Date|string|null} [params.createdAt=null]
   */
  constructor({ id = null, chatId, senderId, senderName = 'User', text, createdAt = null }) {
    this.id = id ? String(id) : null;
    this.chatId = String(chatId);
    this.senderId = String(senderId);
    this.senderName = senderName || 'User';
    this.text = text;
    this.createdAt = createdAt ? new Date(createdAt) : null;
  }

  /**
   * Parses a raw API or WebSocket JSON payload into a MessageModel.
   * @param {object} payload
   * @returns {MessageModel}
   */
  static fromPayload(payload) {
    return new MessageModel({
      id: payload?.id ?? null,
      chatId: payload?.chatId || '',
      senderId: payload?.senderId || '',
      senderName: payload?.senderName || 'User',
      text: payload?.text || '',
      createdAt: payload?.createdAt ?? null,
    });
  }

  /**
   * Returns true when this message was sent by the current user.
   * @param {string|null|undefined} currentUserId
   * @returns {boolean}
   */
  isOwn(currentUserId) {
    return Boolean(currentUserId && this.senderId === String(currentUserId));
  }
}
