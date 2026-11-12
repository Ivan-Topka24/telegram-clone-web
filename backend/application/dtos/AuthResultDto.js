const UserDto = require('./UserDto');

/**
 * Application DTO returned after successful authentication or registration.
 */
class AuthResultDto {
  /**
   * @param {object} params
   * @param {string} params.token
   * @param {UserDto} params.user
   */
  constructor({ token, user }) {
    this.token = token;
    this.user = user instanceof UserDto ? user : new UserDto(user);
  }
}

module.exports = AuthResultDto;
