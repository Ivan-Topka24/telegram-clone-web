import { UserDto } from './UserDto.js';

/**
 * Outgoing request DTO for user login.
 */
export class LoginRequestDto {
  /**
   * @param {{ username: string, password: string }} params
   */
  constructor({ username, password }) {
    this.username = username;
    this.password = password;
  }
}

/**
 * Outgoing request DTO for user registration.
 */
export class RegisterRequestDto {
  /**
   * @param {{ username: string, displayName: string, password: string }} params
   */
  constructor({ username, displayName, password }) {
    this.username = username;
    this.displayName = displayName;
    this.password = password;
  }
}

/**
 * Incoming response DTO for authentication results.
 */
export class AuthResultDto {
  /**
   * @param {{ token: string, user: UserDto }} params
   */
  constructor({ token, user }) {
    this.token = token;
    this.user = user instanceof UserDto ? user : UserDto.fromPayload(user);
  }

  /**
   * Parses a raw API JSON payload into an AuthResultDto.
   * @param {object} payload
   * @returns {AuthResultDto}
   */
  static fromPayload(payload) {
    return new AuthResultDto({
      token: payload?.token || '',
      user: UserDto.fromPayload(payload?.user || {}),
    });
  }
}
