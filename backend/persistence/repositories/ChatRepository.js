const mongoose = require('mongoose');
const IChatRepository = require('../../domain/interfaces/IChatRepository');
const Chat = require('../../domain/models/Chat');
const ChatModel = require('../schemas/ChatSchema');

/**
 * Mongoose-backed repository for Chat entities.
 */
class ChatRepository extends IChatRepository {
  /**
   * Maps a Mongoose Chat document to a clean Chat domain entity.
   * @param {import('mongoose').Document|null} doc
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
    const options = session ? { session } : {};
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
    const doc = await ChatModel.findById(chatId).exec();
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
    }).exec();

    return this._toDomain(doc);
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
      .exec();

    return docs.map((doc) => this._toDomain(doc));
  }

  /**
   * Atomically updates a chat's lastMessage snapshot and updatedAt timestamp.
   * @param {string} chatId
   * @param {{ text: string, senderId: string, createdAt: Date }} lastMessage
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<Chat|null>}
   */
  async updateLastMessage(chatId, lastMessage, session = null) {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return null;
    }

    const updatedAt = lastMessage.createdAt ? new Date(lastMessage.createdAt) : new Date();
    const options = {
      new: true,
      ...(session ? { session } : {}),
    };

    const doc = await ChatModel.findByIdAndUpdate(
      chatId,
      {
        $set: {
          lastMessage: {
            text: lastMessage.text,
            senderId: lastMessage.senderId,
            createdAt: updatedAt,
          },
          updatedAt,
        },
      },
      options
    ).exec();

    return this._toDomain(doc);
  }
}

module.exports = ChatRepository;
