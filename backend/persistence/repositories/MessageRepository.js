const mongoose = require('mongoose');
const IMessageRepository = require('../../domain/interfaces/IMessageRepository');
const Message = require('../../domain/models/Message');
const MessageModel = require('../schemas/MessageSchema');

/**
 * Mongoose-backed repository for Message entities.
 */
class MessageRepository extends IMessageRepository {
  /**
   * Maps a Mongoose Message document to a clean Message domain entity.
   * @param {import('mongoose').Document|null} doc
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
    const options = session ? { session } : {};
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
  async findByChatId(chatId, limit = 50, beforeDate = null) {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return [];
    }

    const filter = { chatId };
    if (beforeDate) {
      filter.createdAt = { $lt: new Date(beforeDate) };
    }

    const docs = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return docs.reverse().map((doc) => this._toDomain(doc));
  }
}

module.exports = MessageRepository;
