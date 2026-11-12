const {
  ValidationException,
  ForbiddenException,
  NotFoundException,
} = require('../../domain/exceptions');

const MAX_MESSAGE_LENGTH = 4096;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;

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
   * @param {{ warn: Function }} [deps.logger]
   */
  constructor({
    unitOfWork,
    chatRepository,
    messageRepository,
    userRepository,
    realtimeNotifier,
    logger = null,
  }) {
    this.unitOfWork = unitOfWork;
    this.chatRepository = chatRepository;
    this.messageRepository = messageRepository;
    this.userRepository = userRepository;
    this.realtimeNotifier = realtimeNotifier;
    this.logger = logger;
  }

  /**
   * Loads a chat and verifies that the requesting user is a member.
   * @param {string} userId
   * @param {string} chatId
   * @returns {Promise<import('../../domain/models/Chat')>}
   */
  async _requireChatMember(userId, chatId) {
    if (!chatId || typeof chatId !== 'string') {
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
   * @param {{ limit?: number|string, before?: string|Date|null }} [options]
   * @returns {Promise<Array<object>>}
   */
  async getChatHistory(userId, chatId, { limit = DEFAULT_HISTORY_LIMIT, before = null } = {}) {
    await this._requireChatMember(userId, chatId);

    const numericLimit = Number(limit);
    const safeLimit =
      Number.isFinite(numericLimit) && numericLimit > 0
        ? Math.min(Math.floor(numericLimit), MAX_HISTORY_LIMIT)
        : DEFAULT_HISTORY_LIMIT;

    let beforeDate = null;
    if (before !== null && before !== undefined && before !== '') {
      beforeDate = new Date(before);
      if (Number.isNaN(beforeDate.getTime())) {
        throw new ValidationException('Invalid before cursor timestamp', 'INVALID_CURSOR');
      }
    }

    const messages = await this.messageRepository.findByChatId(chatId, safeLimit, beforeDate);
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
  async sendMessage(input = {}) {
    const { senderId, chatId, text } = input && typeof input === 'object' ? input : {};
    const trimmedText = typeof text === 'string' ? text.trim() : '';

    if (!trimmedText) {
      throw new ValidationException('Message text cannot be empty', 'EMPTY_MESSAGE');
    }

    if (trimmedText.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationException(
        `Message text cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
        'MESSAGE_TOO_LONG'
      );
    }

    const chat = await this._requireChatMember(senderId, chatId);
    const sender = await this.userRepository.findById(senderId);
    if (!sender) {
      throw new NotFoundException('Sender user not found', 'USER_NOT_FOUND');
    }

    const createdAt = new Date();
    const message = await this.unitOfWork.execute(async () => {
      const createdMessage = await this.messageRepository.create({
        chatId: chat.id,
        senderId: String(senderId),
        text: trimmedText,
        createdAt,
      });

      await this.chatRepository.updateLastMessage(chat.id, {
        text: createdMessage.text,
        senderId: createdMessage.senderId,
        createdAt: createdMessage.createdAt,
      });

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
    try {
      this.realtimeNotifier.notifyUsers(memberIds, 'message:new', messageDto);
    } catch (err) {
      if (this.logger && typeof this.logger.warn === 'function') {
        this.logger.warn('Failed to broadcast new message notification', {
          chatId: chat.id,
          messageId: message.id,
          err,
        });
      }
    }

    return messageDto;
  }
}

module.exports = MessageService;
