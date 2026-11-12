import { getInitials } from '../core/formatters.js';

/**
 * Client-side domain/view model representing a user.
 */
export class UserModel {
  /**
   * @param {object} params
   * @param {string|null} [params.id=null]
   * @param {string} params.username
   * @param {string} params.displayName
   * @param {Date|string|null} [params.createdAt=null]
   */
  constructor({ id = null, username, displayName, createdAt = null }) {
    this.id = id ? String(id) : null;
    this.username = username || '';
    this.displayName = displayName || this.username || 'User';
    this.createdAt = createdAt ? new Date(createdAt) : null;
  }

  /**
   * Returns @username handle string.
   * @returns {string}
   */
  getHandle() {
    return `@${this.username}`;
  }

  /**
   * Returns 1-2 uppercase initials for avatar rendering.
   * @returns {string}
   */
  getInitials() {
    return getInitials(this.displayName);
  }
}
