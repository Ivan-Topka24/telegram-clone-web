/**
 * Contract for chat persistence operations.
 */
class IChatRepository {
  /**
   * Persists a new chat record.
   * @param {object} data
   * @returns {Promise<import('../models/Chat')>}
   */
  async create(data) {
    throw new Error('Not implemented');
  }

  /**
   * Finds a chat by its unique identifier.
   * @param {string} id
   * @returns {Promise<import('../models/Chat')|null>}
   */
  async findById(id) {
    throw new Error('Not implemented');
  }

  /**
   * Finds an existing direct (1-on-1) chat between two users.
   * @param {string} userA
   * @param {string} userB
   * @returns {Promise<import('../models/Chat')|null>}
   */
  async findDirectChat(userA, userB) {
    throw new Error('Not implemented');
  }

  /**
   * Atomically finds an existing direct chat between two users or creates a new one.
   * @param {string} userA
   * @param {string} userB
   * @returns {Promise<{ chat: import('../models/Chat'), created: boolean }>}
   */
  async findOrCreateDirectChat(userA, userB) {
    throw new Error('Not implemented');
  }

  /**
   * Retrieves all chats a user participates in, ordered by recent activity.
   * @param {string} userId
   * @returns {Promise<Array<import('../models/Chat')>>}
   */
  async findUserChats(userId) {
    throw new Error('Not implemented');
  }

  /**
   * Updates the embedded lastMessage snapshot and updatedAt timestamp on a chat.
   * @param {string} chatId
   * @param {object|null} messageData
   * @returns {Promise<import('../models/Chat')|null>}
   */
  async updateLastMessage(chatId, messageData) {
    throw new Error('Not implemented');
  }

  /**
   * Deletes a chat record by its unique identifier.
   * @param {string} chatId
   * @returns {Promise<boolean>}
   */
  async deleteById(chatId) {
    throw new Error('Not implemented');
  }
}

module.exports = IChatRepository;
