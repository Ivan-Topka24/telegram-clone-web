/**
 * Contract for message persistence operations.
 */
class IMessageRepository {
  /**
   * Persists a new message record.
   * @param {object} data
   * @returns {Promise<import('../models/Message')>}
   */
  async create(data) {
    throw new Error('Not implemented');
  }

  /**
   * Fetches message history for a chat with optional pagination cursor.
   * @param {string} chatId
   * @param {number} [limit=50]
   * @param {Date|string|null} [beforeDate=null]
   * @returns {Promise<Array<import('../models/Message')>>}
   */
  async findByChatId(chatId, limit = 50, beforeDate = null) {
    throw new Error('Not implemented');
  }

  /**
   * Finds a message by its unique identifier.
   * @param {string} messageId
   * @returns {Promise<import('../models/Message')|null>}
   */
  async findById(messageId) {
    throw new Error('Not implemented');
  }

  /**
   * Finds the most recent message in a chat.
   * @param {string} chatId
   * @returns {Promise<import('../models/Message')|null>}
   */
  async findLatestByChatId(chatId) {
    throw new Error('Not implemented');
  }

  /**
   * Deletes a single message by its unique identifier.
   * @param {string} messageId
   * @returns {Promise<boolean>}
   */
  async deleteById(messageId) {
    throw new Error('Not implemented');
  }

  /**
   * Deletes all messages belonging to a chat.
   * @param {string} chatId
   * @returns {Promise<number>}
   */
  async deleteByChatId(chatId) {
    throw new Error('Not implemented');
  }

  /**
   * Marks unread messages from other users in a chat as read by readerId.
   * @param {{ chatId: string, readerId: string, upToDate?: Date|string|null }} params
   * @returns {Promise<string[]>}
   */
  async markAsReadByUser({ chatId, readerId, upToDate = null }) {
    throw new Error('Not implemented');
  }
}

module.exports = IMessageRepository;
