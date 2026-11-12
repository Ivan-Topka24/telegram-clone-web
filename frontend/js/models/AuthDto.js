import { UserModel } from './UserModel.js';

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
 * Response DTO representing an authenticated session payload from /auth/login or /auth/register.
 */
export class AuthResultDto {
  /**
   * @param {{ token: string, user: UserModel|object }} params
   */
  constructor({ token, user }) {
    this.token = token || '';
    this.user = user instanceof UserModel ? user : UserModel.fromPayload(user || {});
  }

  /**
   * Parses a raw API JSON payload into an AuthResultDto.
   * @param {object} payload
   * @returns {AuthResultDto}
   */
  static fromPayload(payload) {
    return new AuthResultDto({
      token: payload?.token || '',
      user: payload?.user || {},
    });
  }
}
