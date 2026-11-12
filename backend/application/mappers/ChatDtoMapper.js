const { ChatDto, UserDto } = require('../dtos');

/**
 * Maps Chat domain entities to viewer-specific ChatDto instances.
 */
class ChatDtoMapper {
  /**
   * Converts a Chat domain entity into a ChatDto enriched with displayTitle and peer metadata.
   * @param {import('../../domain/models/Chat')} chat
   * @param {string} viewerUserId
   * @param {Map<string, import('../../domain/models/User')>} [usersById]
   * @returns {ChatDto}
   */
  toDto(chat, viewerUserId, usersById = new Map()) {
    let displayTitle = chat.title || 'Untitled Group';
    let peer = null;

    if (!chat.isGroup()) {
      const peerMember = chat.members.find(
        (member) => String(member.userId) !== String(viewerUserId)
      );
      const peerUser = peerMember ? usersById.get(String(peerMember.userId)) : null;
      peer = peerUser ? UserDto.fromDomain(peerUser) : null;
      displayTitle = peer ? peer.displayName : 'Deleted User';
    }

    return new ChatDto({
      id: chat.id,
      type: chat.type,
      title: chat.title,
      displayTitle,
      peer,
      members: chat.members,
      lastMessage: chat.lastMessage,
      updatedAt: chat.updatedAt,
    });
  }
}

module.exports = ChatDtoMapper;
