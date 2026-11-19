const User = require('../../../backend/domain/models/User');
const Chat = require('../../../backend/domain/models/Chat');
const Message = require('../../../backend/domain/models/Message');
const {
  DomainException,
  ValidationException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} = require('../../../backend/domain/exceptions');

describe('Domain Layer — Models & Exceptions', () => {
  test('User.toPublicProfile() strips passwordHash', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const user = new User({
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      passwordHash: '$2b$10$hashedvalue',
      createdAt,
    });

    const profile = user.toPublicProfile();
    expect(profile).toEqual({
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      createdAt,
    });
    expect(profile.passwordHash).toBeUndefined();
  });

  test('Chat.hasMember() and Chat.isGroup() behave correctly for direct and group chats', () => {
    const directChat = new Chat({
      id: 'c1',
      type: 'direct',
      members: [{ userId: 'u1', role: 'member' }, { userId: 'u2', role: 'member' }],
    });

    expect(directChat.isGroup()).toBe(false);
    expect(directChat.hasMember('u1')).toBe(true);
    expect(directChat.hasMember('u2')).toBe(true);
    expect(directChat.hasMember('u3')).toBe(false);
    expect(directChat.hasMember(null)).toBe(false);

    const groupChat = new Chat({
      id: 'c2',
      type: 'group',
      title: 'Developers',
      members: [{ userId: 'u1', role: 'owner' }, 'u3'],
    });

    expect(groupChat.isGroup()).toBe(true);
    expect(groupChat.hasMember('u1')).toBe(true);
    expect(groupChat.hasMember('u3')).toBe(true);
    expect(groupChat.hasMember('u2')).toBe(false);
    expect(groupChat.isOwner('u1')).toBe(true);
    expect(groupChat.isOwner('u3')).toBe(false);
    expect(directChat.isOwner('u1')).toBe(false);
  });

  test('Message stores normalized identifiers, text, and deduplicated readBy list', () => {
    const now = new Date();
    const msg = new Message({
      id: 'm1',
      chatId: 'c1',
      senderId: 'u1',
      text: 'Hello',
      readBy: ['u2', 'u2', null, 'u3'],
      createdAt: now,
    });

    expect(msg.id).toBe('m1');
    expect(msg.chatId).toBe('c1');
    expect(msg.senderId).toBe('u1');
    expect(msg.text).toBe('Hello');
    expect(msg.readBy).toEqual(['u2', 'u3']);
    expect(msg.createdAt).toEqual(now);
  });

  test('DomainException subclasses map to exact HTTP status codes', () => {
    const validationErr = new ValidationException('Bad input');
    const unauthErr = new UnauthorizedException('No auth');
    const forbiddenErr = new ForbiddenException('Denied');
    const notFoundErr = new NotFoundException('Missing');

    expect(validationErr).toBeInstanceOf(DomainException);
    expect(validationErr.statusCode).toBe(400);
    expect(unauthErr.statusCode).toBe(401);
    expect(forbiddenErr.statusCode).toBe(403);
    expect(notFoundErr.statusCode).toBe(404);
  });
});
