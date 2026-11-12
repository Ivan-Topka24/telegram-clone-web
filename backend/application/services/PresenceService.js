const { TypingIndicatorDto } = require('../dtos');

/**
 * Handles transient real-time presence use cases such as typing indicators.
 */
class PresenceService {
  /**
   * @param {object} deps
   * @param {import('../../domain/interfaces/IChatRepository')} deps.chatRepository
   * @param {import('../../domain/interfaces/IRealtimeNotifier')} deps.realtimeNotifier
   */
  constructor({ chatRepository, realtimeNotifier }) {
    this.chatRepository = chatRepository;
    this.realtimeNotifier = realtimeNotifier;
  }

  /**
   * Verifies chat membership and broadcasts a TypingIndicatorDto to other chat members.
   * @param {{ userId: string, username: string, chatId: string }} input
   * @returns {Promise<void>}
   */
  async notifyTyping({ userId, username, chatId }) {
    if (!chatId || typeof chatId !== 'string') {
      return;
    }

    const chat = await this.chatRepository.findById(chatId);
    if (!chat || !chat.hasMember(userId)) {
      return;
    }

    const actorId = String(userId);
    const recipientIds = chat.members
      .map((member) => String(member.userId))
      .filter((memberId) => memberId !== actorId);

    if (recipientIds.length > 0) {
      const typingDto = new TypingIndicatorDto({
        chatId: chat.id,
        userId: actorId,
        username,
      });
      this.realtimeNotifier.notifyUsers(recipientIds, 'chat:typing', typingDto);
    }
  }
}

module.exports = PresenceService;
