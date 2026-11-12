const UserDto = require('./UserDto');

/**
 * Application DTO representing a conversation from a specific viewer's perspective.
 */
class ChatDto {
  /**
   * @param {object} params
   * @param {string|null} params.id
   * @param {'direct'|'group'} params.type
   * @param {string|null} [params.title=null]
   * @param {string} params.displayTitle
   * @param {UserDto|null} [params.peer=null]
   * @param {Array<object>} [params.members=[]]
   * @param {object|null} [params.lastMessage=null]
   * @param {Date|string|null} [params.updatedAt=null]
   */
  constructor({
    id,
    type,
    title = null,
    displayTitle,
    peer = null,
    members = [],
    lastMessage = null,
    updatedAt = null,
  }) {
    this.id = id ?? null;
    this.type = type;
    this.title = title;
    this.displayTitle = displayTitle;
    this.peer = peer ? (peer instanceof UserDto ? peer : new UserDto(peer)) : null;
    this.members = Array.isArray(members) ? members : [];
    this.lastMessage = lastMessage;
    this.updatedAt = updatedAt ?? null;
  }
}

module.exports = ChatDto;
