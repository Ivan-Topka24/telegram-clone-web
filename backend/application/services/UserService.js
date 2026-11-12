const { UserDto } = require('../dtos');

const MIN_SEARCH_QUERY_LENGTH = 2;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;

/**
 * Handles user directory lookup and search use cases.
 */
class UserService {
  /**
   * @param {object} deps
   * @param {import('../../domain/interfaces/IUserRepository')} deps.userRepository
   */
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  /**
   * Searches users by username prefix, excluding the requesting user.
   * Returns an empty list if the query is shorter than 2 characters.
   * @param {string} query
   * @param {string} currentUserId
   * @param {number} [limit=10]
   * @returns {Promise<Array<UserDto>>}
   */
  async searchUsers(query, currentUserId, limit = DEFAULT_SEARCH_LIMIT) {
    if (typeof query !== 'string') {
      return [];
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      return [];
    }

    const numericLimit = Number(limit);
    const safeLimit =
      Number.isFinite(numericLimit) && numericLimit > 0
        ? Math.min(Math.floor(numericLimit), MAX_SEARCH_LIMIT)
        : DEFAULT_SEARCH_LIMIT;

    const users = await this.userRepository.searchByUsernamePrefix(
      trimmedQuery,
      currentUserId,
      safeLimit
    );
    return users.map((user) => UserDto.fromDomain(user));
  }
}

module.exports = UserService;
