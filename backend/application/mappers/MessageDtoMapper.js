const { MessageDto } = require('../dtos');

/**
 * Maps Message domain entities to MessageDto instances.
 */
class MessageDtoMapper {
  /**
   * Converts a Message domain entity into a MessageDto enriched with sender displayName.
   * @param {import('../../domain/models/Message')} message
   * @param {import('../../domain/models/User')|null} sender
   * @returns {MessageDto}
   */
  toDto(message, sender = null) {
    return new MessageDto({
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      senderName: sender ? sender.displayName : 'Deleted User',
      text: message.text,
      createdAt: message.createdAt,
    });
  }
}

module.exports = MessageDtoMapper;
