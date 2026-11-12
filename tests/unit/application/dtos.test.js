const User = require('../../../backend/domain/models/User');
const Chat = require('../../../backend/domain/models/Chat');
const Message = require('../../../backend/domain/models/Message');
const {
  UserDto,
  AuthResultDto,
  ChatDto,
  MessageDto,
  TypingIndicatorDto,
} = require('../../../backend/application/dtos');
const ChatDtoMapper = require('../../../backend/application/mappers/ChatDtoMapper');
const MessageDtoMapper = require('../../../backend/application/mappers/MessageDtoMapper');

describe('Application Layer — DTOs & Mappers', () => {
  test('UserDto.fromDomain() strips passwordHash and creates a UserDto instance', () => {
    const user = new User({
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      passwordHash: 'secret_hash',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const dto = UserDto.fromDomain(user);
    expect(dto).toBeInstanceOf(UserDto);
    expect(dto.passwordHash).toBeUndefined();
    expect(dto.username).toBe('alice');

    const authDto = new AuthResultDto({ token: 'jwt', user: dto });
    expect(authDto).toBeInstanceOf(AuthResultDto);
    expect(authDto.user).toBeInstanceOf(UserDto);
  });

  test('ChatDtoMapper maps direct Chat to ChatDto with UserDto peer', () => {
    const chat = new Chat({
      id: 'c1',
      type: 'direct',
      members: ['u1', 'u2'],
    });
    const peer = new User({ id: 'u2', username: 'bob', displayName: 'Bob' });
    const mapper = new ChatDtoMapper();

    const dto = mapper.toDto(chat, 'u1', new Map([['u2', peer]]));
    expect(dto).toBeInstanceOf(ChatDto);
    expect(dto.displayTitle).toBe('Bob');
    expect(dto.peer).toBeInstanceOf(UserDto);
    expect(dto.peer.username).toBe('bob');
  });

  test('MessageDtoMapper maps Message to MessageDto and TypingIndicatorDto holds payload', () => {
    const msg = new Message({ id: 'm1', chatId: 'c1', senderId: 'u1', text: 'Hello' });
    const sender = new User({ id: 'u1', username: 'alice', displayName: 'Alice' });
    const mapper = new MessageDtoMapper();

    const msgDto = mapper.toDto(msg, sender);
    expect(msgDto).toBeInstanceOf(MessageDto);
    expect(msgDto.senderName).toBe('Alice');

    const typingDto = new TypingIndicatorDto({ chatId: 'c1', userId: 'u1', username: 'alice' });
    expect(typingDto).toBeInstanceOf(TypingIndicatorDto);
    expect(JSON.parse(JSON.stringify(typingDto))).toEqual({
      chatId: 'c1',
      userId: 'u1',
      username: 'alice',
    });
  });
});
