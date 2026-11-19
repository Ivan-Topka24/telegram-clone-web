const mongoose = require('mongoose');
const IChatRepository = require('../../domain/interfaces/IChatRepository');
const Chat = require('../../domain/models/Chat');
const ChatModel = require('../schemas/ChatSchema');

/**
 * Builds a deterministic sorted key for a pair of direct chat participants.
 * @param {string} userAId
 * @param {string} userBId
 * @returns {string}
 */
function buildDirectKey(userAId, userBId) {
  return [String(userAId), String(userBId)].sort().join(':');
}

/**
 * Mongoose-backed repository for Chat entities.
 */
class ChatRepository extends IChatRepository {
  /**
   * @param {object} [deps]
   * @param {{ getSession?: () => import('mongoose').ClientSession|null }|null} [deps.unitOfWork=null]
   */
  constructor({ unitOfWork = null } = {}) {
    super();
    this.unitOfWork = unitOfWork;
  }

  /**
   * @param {import('mongoose').ClientSession|null} [explicitSession=null]
   * @returns {import('mongoose').ClientSession|null}
   */
  _resolveSession(explicitSession = null) {
    return explicitSession ?? this.unitOfWork?.getSession?.() ?? null;
  }

  /**
   * Maps a Mongoose Chat document or lean object to a clean Chat domain entity.
   * @param {object|null} doc
   * @returns {Chat|null}
   */
  _toDomain(doc) {
    if (!doc) {
      return null;
    }

    const members = Array.isArray(doc.members)
      ? doc.members.map((member) => ({
          userId: member.userId.toString(),
          role: member.role,
          joinedAt: member.joinedAt,
        }))
      : [];

    const lastMessage = doc.lastMessage
      ? {
          text: doc.lastMessage.text,
          senderId: doc.lastMessage.senderId.toString(),
          createdAt: doc.lastMessage.createdAt,
        }
      : null;

    return new Chat({
      id: doc._id.toString(),
      type: doc.type,
      title: doc.title,
      members,
      lastMessage,
      updatedAt: doc.updatedAt,
    });
  }

  /**
   * Persists a new chat document.
   * @param {object} chatData
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<Chat>}
   */
  async create(chatData, session = null) {
    const activeSession = this._resolveSession(session);
    const options = activeSession ? { session: activeSession } : {};
    const [doc] = await ChatModel.create([chatData], options);
    return this._toDomain(doc);
  }

  /**
   * Finds a chat by its unique identifier.
   * @param {string} chatId
   * @returns {Promise<Chat|null>}
   */
  async findById(chatId) {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return null;
    }
    const doc = await ChatModel.findById(chatId).lean().exec();
    return this._toDomain(doc);
  }

  /**
   * Finds an existing direct (1-on-1) chat between two users.
   * @param {string} userAId
   * @param {string} userBId
   * @returns {Promise<Chat|null>}
   */
  async findDirectChat(userAId, userBId) {
    if (
      !mongoose.Types.ObjectId.isValid(userAId) ||
      !mongoose.Types.ObjectId.isValid(userBId)
    ) {
      return null;
    }

    const doc = await ChatModel.findOne({
      type: 'direct',
      members: { $size: 2 },
      'members.userId': { $all: [userAId, userBId] },
    })
      .lean()
      .exec();

    return this._toDomain(doc);
  }

  /**
   * Atomically finds an existing direct chat or creates a new one using a unique directKey.
   * Safe against concurrent creation races between the same pair of users.
   * @param {string} userAId
   * @param {string} userBId
   * @returns {Promise<{ chat: Chat, created: boolean }>}
   */
  async findOrCreateDirectChat(userAId, userBId) {
    const existing = await this.findDirectChat(userAId, userBId);
    if (existing) {
      return { chat: existing, created: false };
    }

    const directKey = buildDirectKey(userAId, userBId);
    const activeSession = this._resolveSession(null);
    const options = activeSession ? { session: activeSession } : {};

    try {
      const [doc] = await ChatModel.create(
        [
          {
            type: 'direct',
            title: null,
            directKey,
            members: [
              { userId: String(userAId), role: 'member' },
              { userId: String(userBId), role: 'member' },
            ],
            updatedAt: new Date(),
          },
        ],
        options
      );
      return { chat: this._toDomain(doc), created: true };
    } catch (err) {
      if (err && err.code === 11000) {
        const doc = await ChatModel.findOne({ directKey }).lean().exec();
        if (doc) {
          return { chat: this._toDomain(doc), created: false };
        }
      }
      throw err;
    }
  }

  /**
   * Retrieves all chats for a user sorted by latest activity descending.
   * @param {string} userId
   * @returns {Promise<Chat[]>}
   */
  async findUserChats(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return [];
    }

    const docs = await ChatModel.find({ 'members.userId': userId })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    return docs.map((doc) => this._toDomain(doc));
  }

  /**
   * Atomically updates a chat's lastMessage snapshot and updatedAt timestamp, or clears lastMessage when null.
   * @param {string} chatId
   * @param {{ text: string, senderId: string, createdAt: Date }|null} lastMessage
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<Chat|null>}
   */
  async updateLastMessage(chatId, lastMessage, session = null) {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return null;
    }

    const activeSession = this._resolveSession(session);
    const options = {
      new: true,
      lean: true,
      ...(activeSession ? { session: activeSession } : {}),
    };

    let updateFields;
    if (lastMessage === null) {
      updateFields = { lastMessage: null };
    } else {
      const updatedAt = lastMessage.createdAt ? new Date(lastMessage.createdAt) : new Date();
      updateFields = {
        lastMessage: {
          text: lastMessage.text,
          senderId: lastMessage.senderId,
          createdAt: updatedAt,
        },
        updatedAt,
      };
    }

    const doc = await ChatModel.findByIdAndUpdate(
      chatId,
      { $set: updateFields },
      options
    ).exec();

    return this._toDomain(doc);
  }

  /**
   * Deletes a chat document by its unique identifier.
   * @param {string} chatId
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<boolean>}
   */
  async deleteById(chatId, session = null) {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return false;
    }

    const activeSession = this._resolveSession(session);
    const options = activeSession ? { session: activeSession } : {};
    const res = await ChatModel.deleteOne({ _id: chatId }, options).exec();
    return res.deletedCount > 0;
  }
}

module.exports = ChatRepository;
