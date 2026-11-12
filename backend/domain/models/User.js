/**
 * Domain entity representing a registered messenger user.
 */
class User {
  /**
   * @param {object} params
   * @param {string|null} [params.id=null]
   * @param {string} params.username
   * @param {string} params.displayName
   * @param {string|null} [params.passwordHash=null]
   * @param {Date|string|null} [params.createdAt=null]
   */
  constructor({ id = null, username, displayName, passwordHash = null, createdAt = null }) {
    this.id = id ? String(id) : null;
    this.username = username;
    this.displayName = displayName;
    this.passwordHash = passwordHash;
    this.createdAt = createdAt ? new Date(createdAt) : null;
  }

  /**
   * Returns a safe public representation of the user without sensitive credentials.
   * @returns {{ id: string|null, username: string, displayName: string, createdAt: Date|null }}
   */
  toPublicProfile() {
    return {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      createdAt: this.createdAt,
    };
  }
}

module.exports = User;
