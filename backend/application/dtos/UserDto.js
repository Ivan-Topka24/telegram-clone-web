/**
 * Application DTO representing a safe public user profile.
 */
class UserDto {
  /**
   * @param {object} params
   * @param {string|null} params.id
   * @param {string} params.username
   * @param {string} params.displayName
   * @param {Date|string|null} [params.createdAt=null]
   */
  constructor({ id, username, displayName, createdAt = null }) {
    this.id = id ?? null;
    this.username = username;
    this.displayName = displayName;
    this.createdAt = createdAt ?? null;
  }

  /**
   * Maps a User domain entity to a UserDto without sensitive credential fields.
   * @param {import('../../domain/models/User')} user
   * @returns {UserDto}
   */
  static fromDomain(user) {
    return new UserDto(user.toPublicProfile());
  }
}

module.exports = UserDto;
