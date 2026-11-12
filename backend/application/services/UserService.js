const MIN_SEARCH_QUERY_LENGTH = 2;

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
   * @returns {Promise<Array<object>>}
   */
  async searchUsers(query, currentUserId) {
    if (typeof query !== 'string') {
      return [];
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      return [];
    }

    const users = await this.userRepository.searchByUsernamePrefix(trimmedQuery, currentUserId);
    return users.map((user) => user.toPublicProfile());
  }
}

module.exports = UserService;
