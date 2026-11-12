import { UserModel } from '../models/UserModel.js';

/**
 * Client-side wire DTO matching backend UserDto.
 */
export class UserDto {
  /**
   * @param {object} params
   * @param {string|null} [params.id=null]
   * @param {string} params.username
   * @param {string} params.displayName
   * @param {string|Date|null} [params.createdAt=null]
   */
  constructor({ id = null, username, displayName, createdAt = null }) {
    this.id = id ?? null;
    this.username = username;
    this.displayName = displayName;
    this.createdAt = createdAt ?? null;
  }

  /**
   * Parses a raw API JSON payload into a UserDto.
   * @param {object} payload
   * @returns {UserDto}
   */
  static fromPayload(payload) {
    return new UserDto({
      id: payload?.id ?? null,
      username: payload?.username || '',
      displayName: payload?.displayName || '',
      createdAt: payload?.createdAt ?? null,
    });
  }

  /**
   * Converts this wire DTO into a client-side UserModel.
   * @returns {UserModel}
   */
  toModel() {
    return new UserModel({
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      createdAt: this.createdAt,
    });
  }
}
