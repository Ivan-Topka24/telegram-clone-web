const User = require('../../../backend/domain/models/User');
const Chat = require('../../../backend/domain/models/Chat');
const ChatService = require('../../../backend/application/services/ChatService');
const { ValidationException } = require('../../../backend/domain/exceptions');

describe('Application Layer — ChatService', () => {
  let chatRepository;
  let userRepository;
  let realtimeNotifier;
  let chatService;

  const userA = new User({ id: 'u1', username: 'alice', displayName: 'Alice' });
  const userB = new User({ id: 'u2', username: 'bob', displayName: 'Bob' });
  const userC = new User({ id: 'u3', username: 'carol', displayName: 'Carol' });

  beforeEach(() => {
    chatRepository = {
      findDirectChat: jest.fn(),
      create: jest.fn(),
      findUserChats: jest.fn(),
    };
    userRepository = {
      findById: jest.fn(),
      findByIds: jest.fn(),
    };
    realtimeNotifier = {
      notifyUsers: jest.fn(),
    };
    chatService = new ChatService({ chatRepository, userRepository, realtimeNotifier });
  });

  test('getOrCreateDirectChat() prevents self-chat with ValidationException', async () => {
    await expect(chatService.getOrCreateDirectChat('u1', 'u1')).rejects.toThrow(
      ValidationException
    );
  });

  test('getOrCreateDirectChat() returns existing direct chat without creating a duplicate', async () => {
    const existingChat = new Chat({
      id: 'c1',
      type: 'direct',
      members: [{ userId: 'u1', role: 'member' }, { userId: 'u2', role: 'member' }],
    });

    userRepository.findById.mockResolvedValue(userB);
    chatRepository.findDirectChat.mockResolvedValue(existingChat);

    const dto = await chatService.getOrCreateDirectChat('u1', 'u2');

    expect(dto.id).toBe('c1');
    expect(dto.displayTitle).toBe('Bob');
    expect(chatRepository.create).not.toHaveBeenCalled();
    expect(realtimeNotifier.notifyUsers).not.toHaveBeenCalled();
  });

  test('getOrCreateDirectChat() creates a new direct chat and notifies target user', async () => {
    userRepository.findById.mockImplementation(async (id) => {
      if (id === 'u2') return userB;
      if (id === 'u1') return userA;
      return null;
    });
    chatRepository.findDirectChat.mockResolvedValue(null);
    chatRepository.create.mockResolvedValue(
      new Chat({
        id: 'c2',
        type: 'direct',
        members: [{ userId: 'u1', role: 'member' }, { userId: 'u2', role: 'member' }],
      })
    );

    const dto = await chatService.getOrCreateDirectChat('u1', 'u2');

    expect(chatRepository.create).toHaveBeenCalledTimes(1);
    expect(dto.displayTitle).toBe('Bob');
    expect(realtimeNotifier.notifyUsers).toHaveBeenCalledWith(
      ['u2'],
      'chat:created',
      expect.objectContaining({ id: 'c2', displayTitle: 'Alice' })
    );
  });

  test('createGroupChat() deduplicates members, assigns owner, and broadcasts chat:created', async () => {
    userRepository.findByIds.mockResolvedValue([userB, userC]);
    chatRepository.create.mockResolvedValue(
      new Chat({
        id: 'g1',
        type: 'group',
        title: 'Engineering',
        members: [
          { userId: 'u1', role: 'owner' },
          { userId: 'u2', role: 'member' },
          { userId: 'u3', role: 'member' },
        ],
      })
    );

    const dto = await chatService.createGroupChat('u1', {
      title: 'Engineering',
      memberIds: ['u1', 'u2', 'u2', 'u3'],
    });

    expect(dto.id).toBe('g1');
    expect(dto.displayTitle).toBe('Engineering');
    expect(realtimeNotifier.notifyUsers).toHaveBeenCalledWith(
      ['u1', 'u2', 'u3'],
      'chat:created',
      expect.objectContaining({ id: 'g1', type: 'group' })
    );
  });
});
