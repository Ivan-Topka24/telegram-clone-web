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
}

module.exports = IMessageRepository;
