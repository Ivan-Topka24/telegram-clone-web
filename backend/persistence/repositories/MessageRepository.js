const mongoose = require('mongoose');
const IMessageRepository = require('../../domain/interfaces/IMessageRepository');
const Message = require('../../domain/models/Message');
const MessageModel = require('../schemas/MessageSchema');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Mongoose-backed repository for Message entities.
 */
class MessageRepository extends IMessageRepository {
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
   * Maps a Mongoose Message document or lean object to a clean Message domain entity.
   * @param {object|null} doc
   * @returns {Message|null}
   */
  _toDomain(doc) {
    if (!doc) {
      return null;
    }

    return new Message({
      id: doc._id.toString(),
      chatId: doc.chatId.toString(),
      senderId: doc.senderId.toString(),
      text: doc.text,
      readBy: Array.isArray(doc.readBy) ? doc.readBy.map((id) => id.toString()) : [],
      createdAt: doc.createdAt,
    });
  }

  /**
   * Persists a new message document.
   * @param {object} messageData
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<Message>}
   */
  async create(messageData, session = null) {
    const activeSession = this._resolveSession(session);
    const options = activeSession ? { session: activeSession } : {};
    const [doc] = await MessageModel.create([messageData], options);
    return this._toDomain(doc);
  }

  /**
   * Retrieves recent messages for a chat sorted chronologically (oldest to newest).
   * @param {string} chatId
   * @param {number} [limit=50]
   * @param {Date|string|null} [beforeDate=null]
   * @returns {Promise<Message[]>}
   */
  async findByChatId(chatId, limit = DEFAULT_LIMIT, beforeDate = null) {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return [];
    }

    const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const filter = { chatId };

    if (beforeDate) {
      const parsedDate = new Date(beforeDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        filter.createdAt = { $lt: parsedDate };
      }
    }

    const docs = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();

    return docs.reverse().map((doc) => this._toDomain(doc));
  }

  /**
   * Finds a message by its unique identifier.
   * @param {string} messageId
   * @returns {Promise<Message|null>}
   */
  async findById(messageId) {
    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return null;
    }

    const activeSession = this._resolveSession(null);
    const query = MessageModel.findById(messageId);
    if (activeSession) {
      query.session(activeSession);
    }

    const doc = await query.lean().exec();
    return this._toDomain(doc);
  }

  /**
   * Finds the most recent message in a chat.
   * @param {string} chatId
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<Message|null>}
   */
  async findLatestByChatId(chatId, session = null) {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return null;
    }

    const activeSession = this._resolveSession(session);
    const query = MessageModel.findOne({ chatId }).sort({ createdAt: -1, _id: -1 });
    if (activeSession) {
      query.session(activeSession);
    }

    const doc = await query.lean().exec();
    return this._toDomain(doc);
  }

  /**
   * Deletes a single message by its unique identifier.
   * @param {string} messageId
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<boolean>}
   */
  async deleteById(messageId, session = null) {
    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return false;
    }

    const activeSession = this._resolveSession(session);
    const options = activeSession ? { session: activeSession } : {};
    const res = await MessageModel.deleteOne({ _id: messageId }, options).exec();
    return res.deletedCount > 0;
  }

  /**
   * Deletes all messages belonging to a chat.
   * @param {string} chatId
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<number>}
   */
  async deleteByChatId(chatId, session = null) {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return 0;
    }

    const activeSession = this._resolveSession(session);
    const options = activeSession ? { session: activeSession } : {};
    const res = await MessageModel.deleteMany({ chatId }, options).exec();
    return res.deletedCount || 0;
  }

  /**
   * Marks unread messages from other users in a chat as read by readerId.
   * @param {{ chatId: string, readerId: string, upToDate?: Date|string|null }} params
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<string[]>}
   */
  async markAsReadByUser({ chatId, readerId, upToDate = null }, session = null) {
    if (
      !chatId ||
      !readerId ||
      !mongoose.Types.ObjectId.isValid(chatId) ||
      !mongoose.Types.ObjectId.isValid(readerId)
    ) {
      return [];
    }

    const filter = {
      chatId,
      senderId: { $ne: readerId },
      readBy: { $ne: readerId },
    };

    if (upToDate) {
      const parsedDate = new Date(upToDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        filter.createdAt = { $lte: parsedDate };
      }
    }

    const activeSession = this._resolveSession(session);
    const findQuery = MessageModel.find(filter).select('_id');
    if (activeSession) {
      findQuery.session(activeSession);
    }

    const unreadDocs = await findQuery.lean().exec();
    if (unreadDocs.length === 0) {
      return [];
    }

    const unreadIds = unreadDocs.map((doc) => doc._id);
    const options = activeSession ? { session: activeSession } : {};
    await MessageModel.updateMany(
      { _id: { $in: unreadIds }, readBy: { $ne: readerId } },
      { $addToSet: { readBy: readerId } },
      options
    ).exec();

    return unreadIds.map((id) => id.toString());
  }
}

module.exports = MessageRepository;
