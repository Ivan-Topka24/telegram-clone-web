/**
 * Normalizes a raw member entry into a consistent chat member object.
 * @param {{ userId?: string, role?: string, joinedAt?: Date|string }|string|null} member
 * @returns {{ userId: string, role: string, joinedAt: Date|null }|null}
 */
function normalizeMember(member) {
  if (member === null || member === undefined) {
    return null;
  }

  if (typeof member === 'object') {
    if (member.userId === undefined || member.userId === null) {
      return null;
    }
    return {
      userId: String(member.userId),
      role: member.role || 'member',
      joinedAt: member.joinedAt ? new Date(member.joinedAt) : null,
    };
  }

  const normalizedId = String(member).trim();
  if (!normalizedId) {
    return null;
  }

  return {
    userId: normalizedId,
    role: 'member',
    joinedAt: null,
  };
}

/**
 * Domain entity representing a direct (1-on-1) or group chat conversation.
 */
class Chat {
  /**
   * @param {object} params
   * @param {string|null} [params.id=null]
   * @param {'direct'|'group'} params.type
   * @param {string|null} [params.title=null]
   * @param {Array<{ userId: string, role?: string, joinedAt?: Date|string }|string>} [params.members=[]]
   * @param {{ messageId?: string, senderId: string, text: string, createdAt: Date|string }|null} [params.lastMessage=null]
   * @param {Date|string|null} [params.updatedAt=null]
   */
  constructor({
    id = null,
    type,
    title = null,
    members = [],
    lastMessage = null,
    updatedAt = null,
  }) {
    this.id = id ? String(id) : null;
    this.type = type;
    this.title = title;
    this.members = Array.isArray(members)
      ? members.map(normalizeMember).filter(Boolean)
      : [];
    this.lastMessage = lastMessage;
    this.updatedAt = updatedAt ? new Date(updatedAt) : null;
  }

  /**
   * Checks whether the specified user is a member of this chat.
   * @param {string} userId
   * @returns {boolean}
   */
  hasMember(userId) {
    if (!userId) {
      return false;
    }
    const targetId = String(userId);
    return this.members.some((member) => member.userId === targetId);
  }

  /**
   * Returns true if this chat is a multi-user group chat.
   * @returns {boolean}
   */
  isGroup() {
    return this.type === 'group';
  }
}

module.exports = Chat;
