import { ChatModel } from '../models/ChatModel.js';
import { UserDto } from './UserDto.js';

/**
 * Outgoing request DTO for creating or fetching a 1-on-1 direct chat.
 */
export class CreateDirectChatRequestDto {
  /**
   * @param {{ targetUserId: string }} params
   */
  constructor({ targetUserId }) {
    this.targetUserId = targetUserId;
  }
}

/**
 * Outgoing request DTO for creating a multi-user group chat.
 */
export class CreateGroupChatRequestDto {
  /**
   * @param {{ title: string, memberIds: string[] }} params
   */
  constructor({ title, memberIds }) {
    this.title = title;
    this.memberIds = Array.isArray(memberIds) ? memberIds : [];
  }
}

/**
 * Client-side wire DTO matching backend ChatDto.
 */
export class ChatDto {
  /**
   * @param {object} params
   */
  constructor({
    id = null,
    type,
    title = null,
    displayTitle = null,
    peer = null,
    members = [],
    lastMessage = null,
    updatedAt = null,
  }) {
    this.id = id ?? null;
    this.type = type;
    this.title = title;
    this.displayTitle = displayTitle;
    this.peer = peer ? (peer instanceof UserDto ? peer : UserDto.fromPayload(peer)) : null;
    this.members = Array.isArray(members) ? members : [];
    this.lastMessage = lastMessage;
    this.updatedAt = updatedAt ?? null;
  }

  /**
   * Parses a raw API or WebSocket JSON payload into a ChatDto.
   * @param {object} payload
   * @returns {ChatDto}
   */
  static fromPayload(payload) {
    return new ChatDto({
      id: payload?.id ?? null,
      type: payload?.type || 'direct',
      title: payload?.title ?? null,
      displayTitle: payload?.displayTitle ?? null,
      peer: payload?.peer ? UserDto.fromPayload(payload.peer) : null,
      members: payload?.members || [],
      lastMessage: payload?.lastMessage || null,
      updatedAt: payload?.updatedAt ?? null,
    });
  }

  /**
   * Converts this wire DTO into a client-side ChatModel.
   * @returns {ChatModel}
   */
  toModel() {
    return new ChatModel({
      id: this.id,
      type: this.type,
      title: this.title,
      displayTitle: this.displayTitle,
      peer: this.peer ? this.peer.toModel() : null,
      members: this.members,
      lastMessage: this.lastMessage,
      updatedAt: this.updatedAt,
    });
  }
}
