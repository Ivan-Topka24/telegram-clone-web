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
}

module.exports = MessageRepository;
