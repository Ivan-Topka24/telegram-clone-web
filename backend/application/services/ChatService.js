const {
  ValidationException,
  NotFoundException,
} = require('../../domain/exceptions');

const MAX_GROUP_TITLE_LENGTH = 100;

/**
 * Handles direct and group chat retrieval and creation use cases.
 */
class ChatService {
  /**
   * @param {object} deps
   * @param {import('../../domain/interfaces/IChatRepository')} deps.chatRepository
   * @param {import('../../domain/interfaces/IUserRepository')} deps.userRepository
   * @param {import('../../domain/interfaces/IRealtimeNotifier')} deps.realtimeNotifier
   */
  constructor({ chatRepository, userRepository, realtimeNotifier }) {
    this.chatRepository = chatRepository;
    this.userRepository = userRepository;
    this.realtimeNotifier = realtimeNotifier;
  }

  /**
   * Enriches a Chat domain entity with displayTitle and peer metadata from the viewer's perspective.
   * @param {import('../../domain/models/Chat')} chat
   * @param {string} viewerUserId
   * @param {Map<string, import('../../domain/models/User')>} usersById
   * @returns {object}
   */
  _toChatDto(chat, viewerUserId, usersById) {
    let displayTitle = chat.title || 'Untitled Group';
    let peer = null;

    if (!chat.isGroup()) {
      const peerMember = chat.members.find(
        (member) => String(member.userId) !== String(viewerUserId)
      );
      const peerUser = peerMember ? usersById.get(String(peerMember.userId)) : null;
      peer = peerUser ? peerUser.toPublicProfile() : null;
      displayTitle = peer ? peer.displayName : 'Deleted User';
    }

    return {
      id: chat.id,
      type: chat.type,
      title: chat.title,
      displayTitle,
      peer,
      members: chat.members,
      lastMessage: chat.lastMessage,
      updatedAt: chat.updatedAt,
    };
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

    return chats.map((chat) => this._toChatDto(chat, userId, usersById));
  }

  /**
   * Returns an existing 1-on-1 chat or creates a new one and notifies the target user.
   * @param {string} currentUserId
   * @param {string} targetUserId
   * @returns {Promise<object>}
   */
  async getOrCreateDirectChat(currentUserId, targetUserId) {
    if (!targetUserId) {
      throw new ValidationException('Target user ID is required', 'MISSING_TARGET_USER');
    }

    if (String(currentUserId) === String(targetUserId)) {
      throw new ValidationException('Cannot create a direct chat with yourself', 'SELF_CHAT_NOT_ALLOWED');
    }

    const targetUser = await this.userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('Target user not found', 'USER_NOT_FOUND');
    }

    const existingChat = await this.chatRepository.findDirectChat(currentUserId, targetUserId);
    if (existingChat) {
      const usersById = new Map([[targetUser.id, targetUser]]);
      return this._toChatDto(existingChat, currentUserId, usersById);
    }

    const currentUser = await this.userRepository.findById(currentUserId);
    if (!currentUser) {
      throw new NotFoundException('Current user not found', 'USER_NOT_FOUND');
    }

    const chat = await this.chatRepository.create({
      type: 'direct',
      title: null,
      members: [
        { userId: String(currentUserId), role: 'member' },
        { userId: String(targetUserId), role: 'member' },
      ],
      updatedAt: new Date(),
    });

    const usersById = new Map([
      [currentUser.id, currentUser],
      [targetUser.id, targetUser],
    ]);

    const dtoForCurrentUser = this._toChatDto(chat, currentUserId, usersById);
    const dtoForTargetUser = this._toChatDto(chat, targetUserId, usersById);

    this.realtimeNotifier.notifyUsers([String(targetUserId)], 'chat:created', dtoForTargetUser);

    return dtoForCurrentUser;
  }

  /**
   * Creates a multi-user group chat with the creator as owner and notifies all members.
   * @param {string} creatorId
   * @param {{ title: string, memberIds: string[] }} input
   * @returns {Promise<object>}
   */
  async createGroupChat(creatorId, { title, memberIds }) {
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

    const chatDto = this._toChatDto(chat, creatorKey, new Map());
    const allMemberIds = [creatorKey, ...uniqueOtherIds];

    this.realtimeNotifier.notifyUsers(allMemberIds, 'chat:created', chatDto);

    return chatDto;
  }
}

module.exports = ChatService;
