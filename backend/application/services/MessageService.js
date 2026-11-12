const {
  ValidationException,
  ForbiddenException,
  NotFoundException,
} = require('../../domain/exceptions');

/**
 * Handles message history retrieval and atomic message dispatch use cases.
 */
class MessageService {
  /**
   * @param {object} deps
   * @param {import('../../domain/interfaces/IUnitOfWork')} deps.unitOfWork
   * @param {import('../../domain/interfaces/IChatRepository')} deps.chatRepository
   * @param {import('../../domain/interfaces/IMessageRepository')} deps.messageRepository
   * @param {import('../../domain/interfaces/IUserRepository')} deps.userRepository
   * @param {import('../../domain/interfaces/IRealtimeNotifier')} deps.realtimeNotifier
   */
  constructor({
    unitOfWork,
    chatRepository,
    messageRepository,
    userRepository,
    realtimeNotifier,
  }) {
    this.unitOfWork = unitOfWork;
    this.chatRepository = chatRepository;
    this.messageRepository = messageRepository;
    this.userRepository = userRepository;
    this.realtimeNotifier = realtimeNotifier;
  }

  /**
   * Loads a chat and verifies that the requesting user is a member.
   * @param {string} userId
   * @param {string} chatId
   * @returns {Promise<import('../../domain/models/Chat')>}
   */
  async _requireChatMember(userId, chatId) {
    if (!chatId) {
      throw new ValidationException('Chat ID is required', 'MISSING_CHAT_ID');
    }

    const chat = await this.chatRepository.findById(chatId);
    if (!chat) {
      throw new NotFoundException('Chat not found', 'CHAT_NOT_FOUND');
    }

    if (!chat.hasMember(userId)) {
      throw new ForbiddenException('You are not a member of this chat', 'NOT_CHAT_MEMBER');
    }

    return chat;
  }

  /**
   * Fetches chronological message history for a chat and enriches sender display names.
   * @param {string} userId
   * @param {string} chatId
   * @returns {Promise<Array<object>>}
   */
  async getChatHistory(userId, chatId) {
    await this._requireChatMember(userId, chatId);

    const messages = await this.messageRepository.findByChatId(chatId);
    if (messages.length === 0) {
      return [];
    }

    const senderIds = [...new Set(messages.map((msg) => msg.senderId))];
    const senders = await this.userRepository.findByIds(senderIds);
    const sendersById = new Map(senders.map((user) => [user.id, user]));

    return messages.map((msg) => {
      const sender = sendersById.get(msg.senderId);
      return {
        id: msg.id,
        chatId: msg.chatId,
        senderId: msg.senderId,
        senderName: sender ? sender.displayName : 'Deleted User',
        text: msg.text,
        createdAt: msg.createdAt,
      };
    });
  }

  /**
   * Validates, persists atomically via UnitOfWork, and broadcasts a new chat message.
   * @param {{ senderId: string, chatId: string, text: string }} input
   * @returns {Promise<object>}
   */
  async sendMessage({ senderId, chatId, text }) {
    const trimmedText = typeof text === 'string' ? text.trim() : '';
    if (!trimmedText) {
      throw new ValidationException('Message text cannot be empty', 'EMPTY_MESSAGE');
    }

    const chat = await this._requireChatMember(senderId, chatId);
    const sender = await this.userRepository.findById(senderId);
    if (!sender) {
      throw new NotFoundException('Sender user not found', 'USER_NOT_FOUND');
    }

    const createdAt = new Date();
    const message = await this.unitOfWork.execute(async (session) => {
      const createdMessage = await this.messageRepository.create(
        {
          chatId: chat.id,
          senderId: String(senderId),
          text: trimmedText,
          createdAt,
        },
        session
      );

      await this.chatRepository.updateLastMessage(
        chat.id,
        {
          text: createdMessage.text,
          senderId: createdMessage.senderId,
          createdAt: createdMessage.createdAt,
        },
        session
      );

      return createdMessage;
    });

    const messageDto = {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      senderName: sender.displayName,
      text: message.text,
      createdAt: message.createdAt,
    };

    const memberIds = chat.members.map((member) => String(member.userId));
    this.realtimeNotifier.notifyUsers(memberIds, 'message:new', messageDto);

    return messageDto;
  }
}

module.exports = MessageService;
