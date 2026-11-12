const mongoose = require('mongoose');
const IUserRepository = require('../../domain/interfaces/IUserRepository');
const User = require('../../domain/models/User');
const UserModel = require('../schemas/UserSchema');

/**
 * Escapes special regular expression characters from user input.
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mongoose-backed repository for User entities.
 */
class UserRepository extends IUserRepository {
  /**
   * Maps a Mongoose User document to a clean User domain entity.
   * @param {import('mongoose').Document|null} doc
   * @returns {User|null}
   */
  _toDomain(doc) {
    if (!doc) {
      return null;
    }

    return new User({
      id: doc._id.toString(),
      username: doc.username,
      displayName: doc.displayName,
      passwordHash: doc.passwordHash,
      createdAt: doc.createdAt,
    });
  }

  /**
   * Persists a new user record.
   * @param {object} userData
   * @param {import('mongoose').ClientSession|null} [session=null]
   * @returns {Promise<User>}
   */
  async create(userData, session = null) {
    const options = session ? { session } : {};
    const [doc] = await UserModel.create([userData], options);
    return this._toDomain(doc);
  }

  /**
   * Finds a user by unique identifier.
   * @param {string} id
   * @returns {Promise<User|null>}
   */
  async findById(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await UserModel.findById(id).exec();
    return this._toDomain(doc);
  }

  /**
   * Finds multiple users by their identifiers.
   * @param {string[]} ids
   * @returns {Promise<User[]>}
   */
  async findByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return [];
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return [];
    }

    const docs = await UserModel.find({ _id: { $in: validIds } }).exec();
    return docs.map((doc) => this._toDomain(doc));
  }

  /**
   * Finds a user by exact username (case-insensitive).
   * @param {string} username
   * @returns {Promise<User|null>}
   */
  async findByUsername(username) {
    if (!username || typeof username !== 'string') {
      return null;
    }
    const normalized = username.trim().toLowerCase();
    const doc = await UserModel.findOne({ username: normalized }).exec();
    return this._toDomain(doc);
  }

  /**
   * Searches users whose username starts with the given prefix.
   * @param {string} query
   * @param {string} excludeUserId
   * @param {number} [limit=10]
   * @returns {Promise<User[]>}
   */
  async searchByUsernamePrefix(query, excludeUserId, limit = 10) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const filter = {
      username: { $regex: `^${escapeRegex(normalized)}` },
    };

    if (excludeUserId && mongoose.Types.ObjectId.isValid(excludeUserId)) {
      filter._id = { $ne: excludeUserId };
    }

    const docs = await UserModel.find(filter)
      .sort({ username: 1 })
      .limit(limit)
      .exec();

    return docs.map((doc) => this._toDomain(doc));
  }
}

module.exports = UserRepository;
