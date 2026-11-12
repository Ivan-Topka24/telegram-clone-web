import { MessageModel } from '../models/MessageModel.js';
import { TypingIndicatorModel } from '../models/TypingIndicatorModel.js';

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
 * Client-side wire DTO matching backend MessageDto.
 */
export class MessageDto {
  /**
   * @param {object} params
   */
  constructor({ id = null, chatId, senderId, senderName = 'User', text, createdAt = null }) {
    this.id = id ?? null;
    this.chatId = chatId;
    this.senderId = senderId;
    this.senderName = senderName;
    this.text = text;
    this.createdAt = createdAt ?? null;
  }

  /**
   * Parses a raw API or WebSocket JSON payload into a MessageDto.
   * @param {object} payload
   * @returns {MessageDto}
   */
  static fromPayload(payload) {
    return new MessageDto({
      id: payload?.id ?? null,
      chatId: payload?.chatId || '',
      senderId: payload?.senderId || '',
      senderName: payload?.senderName || 'User',
      text: payload?.text || '',
      createdAt: payload?.createdAt ?? null,
    });
  }

  /**
   * Converts this wire DTO into a client-side MessageModel.
   * @returns {MessageModel}
   */
  toModel() {
    return new MessageModel({
      id: this.id,
      chatId: this.chatId,
      senderId: this.senderId,
      senderName: this.senderName,
      text: this.text,
      createdAt: this.createdAt,
    });
  }
}

/**
 * Client-side wire DTO matching backend TypingIndicatorDto.
 */
export class TypingIndicatorDto {
  /**
   * @param {{ chatId: string, userId: string, username: string }} params
   */
  constructor({ chatId, userId, username }) {
    this.chatId = chatId;
    this.userId = userId;
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

  /**
   * Converts this wire DTO into a client-side TypingIndicatorModel.
   * @returns {TypingIndicatorModel}
   */
  toModel() {
    return new TypingIndicatorModel({
      chatId: this.chatId,
      userId: this.userId,
      username: this.username,
    });
  }
}
