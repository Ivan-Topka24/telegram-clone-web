const {
  ValidationException,
  ForbiddenException,
  NotFoundException,
} = require('../../domain/exceptions');
const MessageDtoMapper = require('../mappers/MessageDtoMapper');

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
   * @param {MessageDtoMapper} [deps.messageDtoMapper]
   * @param {{ warn: Function }} [deps.logger]
   */
  constructor({
    unitOfWork,
    chatRepository,
    messageRepository,
    userRepository,
    realtimeNotifier,
    messageDtoMapper = new MessageDtoMapper(),
    logger = null,
  }) {
    this.unitOfWork = unitOfWork;
    this.chatRepository = chatRepository;
    this.messageRepository = messageRepository;
    this.userRepository = userRepository;
    this.realtimeNotifier = realtimeNotifier;
    this.messageDtoMapper = messageDtoMapper;
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
   * Fetches chronological message history for a chat and maps entities to MessageDto instances.
   * @param {string} userId
   * @param {string} chatId
   * @param {{ limit?: number|string, before?: string|Date|null }} [options]
   * @returns {Promise<Array<import('../dtos/MessageDto')>>}
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

    return messages.map((msg) =>
      this.messageDtoMapper.toDto(msg, sendersById.get(msg.senderId) || null)
    );
  }

  /**
   * Validates, persists atomically via UnitOfWork, and broadcasts a MessageDto.
   * @param {{ senderId: string, chatId: string, text: string }} input
   * @returns {Promise<import('../dtos/MessageDto')>}
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

    const messageDto = this.messageDtoMapper.toDto(message, sender);

    const memberIds = chat.members.map((member) => String(member.userId));
    this._safeNotifyUsers(memberIds, 'message:new', messageDto, {
      chatId: chat.id,
      messageId: message.id,
    });

    return messageDto;
  }

  /**
   * Dispatches real-time notifications safely without failing already-persisted operations.
   * @param {string[]} userIds
   * @param {string} event
   * @param {any} payload
   * @param {object} [context={}]
   */
  _safeNotifyUsers(userIds, event, payload, context = {}) {
    try {
      this.realtimeNotifier.notifyUsers(userIds, event, payload);
    } catch (err) {
      if (this.logger && typeof this.logger.warn === 'function') {
        this.logger.warn(`Failed to broadcast ${event} notification`, {
          ...context,
          err,
        });
      }
    }
  }

  /**
   * Deletes a message authored by the requesting user, recalculates chat.lastMessage, and broadcasts message:deleted.
   * @param {{ userId: string, chatId: string, messageId: string }} input
   * @returns {Promise<{ chatId: string, messageId: string, lastMessage: object|null }>}
   */
  async deleteMessage(input = {}) {
    const { userId, chatId, messageId } = input && typeof input === 'object' ? input : {};
    if (!messageId || typeof messageId !== 'string' || !messageId.trim()) {
      throw new ValidationException('Message ID is required', 'MISSING_MESSAGE_ID');
    }

    const chat = await this._requireChatMember(userId, chatId);
    const message = await this.messageRepository.findById(messageId.trim());
    if (!message || String(message.chatId) !== String(chat.id)) {
      throw new NotFoundException('Message not found', 'MESSAGE_NOT_FOUND');
    }

    if (String(message.senderId) !== String(userId)) {
      throw new ForbiddenException(
        'You can only delete your own messages',
        'FORBIDDEN_MESSAGE_DELETE'
      );
    }

    const lastMessage = await this.unitOfWork.execute(async () => {
      await this.messageRepository.deleteById(message.id);
      const latest = this.messageRepository.findLatestByChatId
        ? await this.messageRepository.findLatestByChatId(chat.id)
        : null;
      const nextLastMessage = latest
        ? {
            text: latest.text,
            senderId: latest.senderId,
            createdAt: latest.createdAt,
          }
        : null;
      await this.chatRepository.updateLastMessage(chat.id, nextLastMessage);
      return nextLastMessage;
    });

    const result = {
      chatId: chat.id,
      messageId: message.id,
      lastMessage,
    };

    const memberIds = chat.members.map((member) => String(member.userId));
    this._safeNotifyUsers(memberIds, 'message:deleted', result, {
      chatId: chat.id,
      messageId: message.id,
    });

    return result;
  }

  /**
   * Marks unread messages from other participants in a chat as read by userId and broadcasts message:read.
   * @param {{ userId: string, chatId: string, upToMessageId?: string|null }} input
   * @returns {Promise<{ chatId: string, readerId: string, messageIds: string[] }>}
   */
  async markMessagesAsRead(input = {}) {
    const { userId, chatId, upToMessageId = null } = input && typeof input === 'object' ? input : {};
    const chat = await this._requireChatMember(userId, chatId);

    let upToDate = null;
    if (upToMessageId && typeof upToMessageId === 'string' && this.messageRepository.findById) {
      const targetMessage = await this.messageRepository.findById(upToMessageId.trim());
      if (targetMessage && String(targetMessage.chatId) === String(chat.id)) {
        upToDate = targetMessage.createdAt;
      }
    }

    const readerId = String(userId);
    const messageIds = await this.messageRepository.markAsReadByUser({
      chatId: chat.id,
      readerId,
      upToDate,
    });

    const result = {
      chatId: chat.id,
      readerId,
      messageIds,
    };

    if (messageIds.length > 0) {
      const memberIds = chat.members.map((member) => String(member.userId));
      this._safeNotifyUsers(memberIds, 'message:read', result, {
        chatId: chat.id,
        readerId,
      });
    }

    return result;
  }
}

module.exports = MessageService;
