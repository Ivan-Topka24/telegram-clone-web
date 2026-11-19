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
 * Outgoing WebSocket DTO for marking chat messages as read.
 */
export class MarkReadEventDto {
  /**
   * @param {{ chatId: string, upToMessageId?: string|null }} params
   */
  constructor({ chatId, upToMessageId = null }) {
    this.chatId = chatId;
    this.upToMessageId = upToMessageId;
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
   * @param {Array<string>} [params.readBy=[]]
   * @param {Date|string|null} [params.createdAt=null]
   */
  constructor({
    id = null,
    chatId,
    senderId,
    senderName = 'User',
    text,
    readBy = [],
    createdAt = null,
  }) {
    this.id = id ? String(id) : null;
    this.chatId = String(chatId);
    this.senderId = String(senderId);
    this.senderName = senderName || 'User';
    this.text = text;
    this.readBy = Array.isArray(readBy)
      ? [...new Set(readBy.filter(Boolean).map((uid) => String(uid)))]
      : [];
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
      readBy: Array.isArray(payload?.readBy) ? payload.readBy : [],
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

  /**
   * Returns true if at least one user other than the sender has viewed this message.
   * @returns {boolean}
   */
  isViewed() {
    return this.readBy.some((uid) => uid !== this.senderId);
  }

  /**
   * Returns true if the given userId has already viewed this message.
   * @param {string|null|undefined} userId
   * @returns {boolean}
   */
  isViewedBy(userId) {
    if (!userId) {
      return false;
    }
    return this.readBy.includes(String(userId));
  }

  /**
   * Returns a new MessageModel with readerId added to readBy.
   * @param {string} readerId
   * @returns {MessageModel}
   */
  withReader(readerId) {
    const normalized = readerId ? String(readerId) : '';
    if (!normalized || this.readBy.includes(normalized)) {
      return this;
    }
    return new MessageModel({
      id: this.id,
      chatId: this.chatId,
      senderId: this.senderId,
      senderName: this.senderName,
      text: this.text,
      readBy: [...this.readBy, normalized],
      createdAt: this.createdAt,
    });
  }
}
