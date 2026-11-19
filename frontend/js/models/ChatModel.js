import { UserModel } from './UserModel.js';

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
 * Client-side domain/view model representing a conversation in the UI.
 */
export class ChatModel {
  /**
   * @param {object} params
   * @param {string|null} [params.id=null]
   * @param {'direct'|'group'} params.type
   * @param {string|null} [params.title=null]
   * @param {string|null} [params.displayTitle=null]
   * @param {UserModel|object|null} [params.peer=null]
   * @param {Array<object>} [params.members=[]]
   * @param {{ text: string, senderId: string, createdAt: Date|string }|null} [params.lastMessage=null]
   * @param {Date|string|null} [params.updatedAt=null]
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
    this.id = id ? String(id) : null;
    this.type = type;
    this.title = title;
    this.displayTitle = displayTitle;
    this.peer = peer ? (peer instanceof UserModel ? peer : UserModel.fromPayload(peer)) : null;
    this.members = Array.isArray(members) ? members : [];
    this.lastMessage = lastMessage
      ? {
          text: lastMessage.text,
          senderId: String(lastMessage.senderId),
          createdAt: lastMessage.createdAt ? new Date(lastMessage.createdAt) : null,
        }
      : null;
    this.updatedAt = updatedAt ? new Date(updatedAt) : null;
  }

  /**
   * Parses a raw API or WebSocket JSON payload into a ChatModel.
   * @param {object} payload
   * @returns {ChatModel}
   */
  static fromPayload(payload) {
    return new ChatModel({
      id: payload?.id ?? null,
      type: payload?.type || 'direct',
      title: payload?.title ?? null,
      displayTitle: payload?.displayTitle ?? null,
      peer: payload?.peer ? UserModel.fromPayload(payload.peer) : null,
      members: payload?.members || [],
      lastMessage: payload?.lastMessage || null,
      updatedAt: payload?.updatedAt ?? null,
    });
  }

  /**
   * @returns {boolean}
   */
  isGroup() {
    return this.type === 'group';
  }

  /**
   * Returns true if the given userId is the owner of this group chat.
   * @param {string|null|undefined} userId
   * @returns {boolean}
   */
  isOwner(userId) {
    if (!userId || !this.isGroup()) {
      return false;
    }
    const targetId = String(userId);
    return this.members.some(
      (member) => String(member.userId) === targetId && member.role === 'owner'
    );
  }

  /**
   * Returns true if userId can delete this chat (group owner for groups, either member for direct chats).
   * @param {string|null|undefined} userId
   * @returns {boolean}
   */
  canDelete(userId) {
    if (!userId) {
      return false;
    }
    if (this.isGroup()) {
      return this.isOwner(userId);
    }
    const targetId = String(userId);
    return (
      this.members.length === 0 ||
      this.members.some((member) => String(member.userId) === targetId)
    );
  }

  /**
   * @returns {string}
   */
  getResolvedTitle() {
    return this.displayTitle || this.title || 'Chat';
  }

  /**
   * @returns {string}
   */
  getPreviewText() {
    if (this.lastMessage?.text) {
      return this.lastMessage.text;
    }
    return this.isGroup() ? 'Group created' : 'No messages yet';
  }

  /**
   * @returns {number}
   */
  getActivityTimestamp() {
    return this.updatedAt ? this.updatedAt.getTime() : 0;
  }

  /**
   * Returns a new ChatModel snapshot with an updated lastMessage (or null) and updatedAt timestamp.
   * @param {import('./MessageModel.js').MessageModel|object|null} message
   * @returns {ChatModel}
   */
  withLastMessage(message) {
    return new ChatModel({
      id: this.id,
      type: this.type,
      title: this.title,
      displayTitle: this.displayTitle,
      peer: this.peer,
      members: this.members,
      lastMessage: message
        ? {
            text: message.text,
            senderId: message.senderId,
            createdAt: message.createdAt,
          }
        : null,
      updatedAt: message ? message.createdAt || new Date() : this.updatedAt,
    });
  }
}
