/**
 * Outgoing WebSocket DTO for sending a typing indicator event.
 */
export class TypingEventDto {
  /**
   * @param {{ chatId: string }} params
   */
  constructor({ chatId }) {
    this.chatId = chatId;
  }
}

/**
 * Transient WebSocket DTO representing an incoming typing indicator event.
 */
export class TypingIndicatorDto {
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

  /**
   * Parses a raw WebSocket JSON payload into a TypingIndicatorDto.
   * @param {object} payload
   * @returns {TypingIndicatorDto}
   */
  static fromPayload(payload) {
    return new TypingIndicatorDto({
      chatId: payload?.chatId || '',
      userId: payload?.userId || '',
      username: payload?.username || '',
    });
  }
}
