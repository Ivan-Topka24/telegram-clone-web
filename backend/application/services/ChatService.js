const {
  ValidationException,
  ForbiddenException,
  NotFoundException,
} = require('../../domain/exceptions');
const ChatDtoMapper = require('../mappers/ChatDtoMapper');

const MAX_GROUP_TITLE_LENGTH = 100;

/**
 * Handles direct and group chat retrieval, creation, and deletion use cases.
 */
class ChatService {
  /**
   * @param {object} deps
   * @param {import('../../domain/interfaces/IChatRepository')} deps.chatRepository
   * @param {import('../../domain/interfaces/IUserRepository')} deps.userRepository
   * @param {import('../../domain/interfaces/IRealtimeNotifier')} deps.realtimeNotifier
   * @param {import('../../domain/interfaces/IUnitOfWork')|null} [deps.unitOfWork]
   * @param {import('../../domain/interfaces/IMessageRepository')|null} [deps.messageRepository]
   * @param {ChatDtoMapper} [deps.chatDtoMapper]
   * @param {{ warn: Function }} [deps.logger]
   */
  constructor({
    chatRepository,
    userRepository,
    realtimeNotifier,
    unitOfWork = null,
    messageRepository = null,
    chatDtoMapper = new ChatDtoMapper(),
    logger = null,
  }) {
    this.chatRepository = chatRepository;
    this.userRepository = userRepository;
    this.realtimeNotifier = realtimeNotifier;
    this.unitOfWork = unitOfWork || { execute: async (work) => work() };
    this.messageRepository = messageRepository;
    this.chatDtoMapper = chatDtoMapper;
    this.logger = logger;
  }

  /**
   * Dispatches real-time notifications safely without failing already-persisted operations.
   * @param {string[]} userIds
   * @param {string} event
   * @param {any} payload
   */
  _safeNotifyUsers(userIds, event, payload) {
    try {
      this.realtimeNotifier.notifyUsers(userIds, event, payload);
    } catch (err) {
      if (this.logger && typeof this.logger.warn === 'function') {
        this.logger.warn('Failed to emit chat realtime notification', { event, err });
      }
    }
  }

  /**
   * Fetches all chats for the given user and enriches direct chats with peer details.
   * @param {string} userId
   * @returns {Promise<Array<object>>}
   */
  async getUserChats(userId) {
    const chats = await this.chatRepository.findUserChats(userId);
    if (chats.length === 0) {
      return [];
    }

    const peerIds = new Set();
    for (const chat of chats) {
      if (!chat.isGroup()) {
        for (const member of chat.members) {
          if (String(member.userId) !== String(userId)) {
            peerIds.add(String(member.userId));
          }
        }
      }
    }

    const peers = peerIds.size > 0 ? await this.userRepository.findByIds([...peerIds]) : [];
    const usersById = new Map(peers.map((user) => [user.id, user]));

    return chats.map((chat) => this.chatDtoMapper.toDto(chat, userId, usersById));
  }

  /**
   * Returns an existing 1-on-1 chat or atomically creates a new one and notifies the target user.
   * @param {string} currentUserId
   * @param {string} targetUserId
   * @returns {Promise<object>}
   */
  async getOrCreateDirectChat(currentUserId, targetUserId) {
    if (!targetUserId || typeof targetUserId !== 'string') {
      throw new ValidationException('Target user ID is required', 'MISSING_TARGET_USER');
    }

    const normalizedTargetId = targetUserId.trim();
    if (!normalizedTargetId) {
      throw new ValidationException('Target user ID is required', 'MISSING_TARGET_USER');
    }

    if (String(currentUserId) === normalizedTargetId) {
      throw new ValidationException(
        'Cannot create a direct chat with yourself',
        'SELF_CHAT_NOT_ALLOWED'
      );
    }

    const [targetUser, currentUser] = await Promise.all([
      this.userRepository.findById(normalizedTargetId),
      this.userRepository.findById(currentUserId),
    ]);

    if (!targetUser) {
      throw new NotFoundException('Target user not found', 'USER_NOT_FOUND');
    }
    if (!currentUser) {
      throw new NotFoundException('Current user not found', 'USER_NOT_FOUND');
    }

    const { chat, created } = await this.chatRepository.findOrCreateDirectChat(
      String(currentUserId),
      normalizedTargetId
    );

    const usersById = new Map([
      [currentUser.id, currentUser],
      [targetUser.id, targetUser],
    ]);

    const dtoForCurrentUser = this.chatDtoMapper.toDto(chat, currentUserId, usersById);

    if (created) {
      const dtoForTargetUser = this.chatDtoMapper.toDto(chat, normalizedTargetId, usersById);
      this._safeNotifyUsers([normalizedTargetId], 'chat:created', dtoForTargetUser);
    }

    return dtoForCurrentUser;
  }

  /**
   * Creates a multi-user group chat with the creator as owner and notifies all members.
   * @param {string} creatorId
   * @param {{ title: string, memberIds: string[] }} input
   * @returns {Promise<object>}
   */
  async createGroupChat(creatorId, input = {}) {
    const { title, memberIds } = input && typeof input === 'object' ? input : {};
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';

    if (!trimmedTitle || trimmedTitle.length > MAX_GROUP_TITLE_LENGTH) {
      throw new ValidationException(
        `Group title must be between 1 and ${MAX_GROUP_TITLE_LENGTH} characters`,
        'INVALID_GROUP_TITLE'
      );
    }

    if (!Array.isArray(memberIds)) {
      throw new ValidationException('memberIds must be an array', 'INVALID_MEMBERS');
    }

    const creatorKey = String(creatorId);
    const uniqueOtherIds = [
      ...new Set(
        memberIds
          .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')
          .map((id) => String(id).trim())
      ),
    ].filter((id) => id !== creatorKey);

    if (uniqueOtherIds.length === 0) {
      throw new ValidationException(
        'Group chat must include at least one other member',
        'INSUFFICIENT_GROUP_MEMBERS'
      );
    }

    const existingUsers = await this.userRepository.findByIds(uniqueOtherIds);
    if (existingUsers.length !== uniqueOtherIds.length) {
      throw new NotFoundException('One or more selected members were not found', 'USER_NOT_FOUND');
    }

    const members = [
      { userId: creatorKey, role: 'owner' },
      ...uniqueOtherIds.map((userId) => ({ userId, role: 'member' })),
    ];

    const chat = await this.chatRepository.create({
      type: 'group',
      title: trimmedTitle,
      members,
      updatedAt: new Date(),
    });

    const chatDto = this.chatDtoMapper.toDto(chat, creatorKey);
    const allMemberIds = [creatorKey, ...uniqueOtherIds];

    this._safeNotifyUsers(allMemberIds, 'chat:created', chatDto);

    return chatDto;
  }

  /**
   * Permanently deletes a chat and its message history.
   * Group chats can only be deleted by their owner; direct chats can be deleted by either participant.
   * @param {string} userId
   * @param {string} chatId
   * @returns {Promise<{ chatId: string }>}
   */
  async deleteChat(userId, chatId) {
    if (!chatId || typeof chatId !== 'string' || !chatId.trim()) {
      throw new ValidationException('Chat ID is required', 'MISSING_CHAT_ID');
    }

    const chat = await this.chatRepository.findById(chatId.trim());
    if (!chat) {
      throw new NotFoundException('Chat not found', 'CHAT_NOT_FOUND');
    }

    if (!chat.hasMember(userId)) {
      throw new ForbiddenException('You are not a member of this chat', 'NOT_CHAT_MEMBER');
    }

    if (chat.isGroup() && !chat.isOwner(userId)) {
      throw new ForbiddenException(
        'Only the group owner can delete this group',
        'FORBIDDEN_GROUP_DELETE'
      );
    }

    const memberIds = chat.members.map((member) => String(member.userId));

    await this.unitOfWork.execute(async () => {
      if (this.messageRepository && typeof this.messageRepository.deleteByChatId === 'function') {
        await this.messageRepository.deleteByChatId(chat.id);
      }
      await this.chatRepository.deleteById(chat.id);
    });

    const result = { chatId: chat.id };
    this._safeNotifyUsers(memberIds, 'chat:deleted', result);
    return result;
  }

  /**
   * Backwards-compatible alias for deleting a chat.
   * @param {string} userId
   * @param {string} chatId
   * @returns {Promise<{ chatId: string }>}
   */
  async deleteGroupChat(userId, chatId) {
    return this.deleteChat(userId, chatId);
  }
}

module.exports = ChatService;
