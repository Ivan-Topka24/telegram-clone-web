const User = require('../../../backend/domain/models/User');
const Chat = require('../../../backend/domain/models/Chat');
const Message = require('../../../backend/domain/models/Message');
const MessageService = require('../../../backend/application/services/MessageService');
const {
  ForbiddenException,
  ValidationException,
} = require('../../../backend/domain/exceptions');

describe('Application Layer — MessageService', () => {
  let unitOfWork;
  let chatRepository;
  let messageRepository;
  let userRepository;
  let realtimeNotifier;
  let messageService;

  const chat = new Chat({
    id: 'c1',
    type: 'direct',
    members: [{ userId: 'u1', role: 'member' }, { userId: 'u2', role: 'member' }],
  });

  beforeEach(() => {
    unitOfWork = {
      execute: jest.fn(async (cb) => cb('mock-session')),
    };
    chatRepository = {
      findById: jest.fn(),
      updateLastMessage: jest.fn(),
    };
    messageRepository = {
      create: jest.fn(),
      findByChatId: jest.fn(),
    };
    userRepository = {
      findById: jest.fn(),
      findByIds: jest.fn(),
    };
    realtimeNotifier = {
      notifyUsers: jest.fn(),
    };

    messageService = new MessageService({
      unitOfWork,
      chatRepository,
      messageRepository,
      userRepository,
      realtimeNotifier,
    });
  });

  test('sendMessage() throws ForbiddenException if sender is not a chat member', async () => {
    chatRepository.findById.mockResolvedValue(chat);

    await expect(
      messageService.sendMessage({ senderId: 'u99', chatId: 'c1', text: 'Intruder' })
    ).rejects.toThrow(ForbiddenException);
    expect(unitOfWork.execute).not.toHaveBeenCalled();
  });

  test('sendMessage() throws ValidationException for empty text', async () => {
    await expect(
      messageService.sendMessage({ senderId: 'u1', chatId: 'c1', text: '   ' })
    ).rejects.toThrow(ValidationException);
  });

  test('sendMessage() runs UnitOfWork, updates lastMessage, and broadcasts message:new', async () => {
    chatRepository.findById.mockResolvedValue(chat);
    userRepository.findById.mockResolvedValue(
      new User({ id: 'u1', username: 'alice', displayName: 'Alice' })
    );
    const createdAt = new Date();
    messageRepository.create.mockResolvedValue(
      new Message({
        id: 'm1',
        chatId: 'c1',
        senderId: 'u1',
        text: 'Hello Bob!',
        createdAt,
      })
    );

    const dto = await messageService.sendMessage({
      senderId: 'u1',
      chatId: 'c1',
      text: 'Hello Bob!',
    });

    expect(unitOfWork.execute).toHaveBeenCalledTimes(1);
    expect(messageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'c1', senderId: 'u1', text: 'Hello Bob!' }),
      'mock-session'
    );
    expect(chatRepository.updateLastMessage).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ text: 'Hello Bob!', senderId: 'u1' }),
      'mock-session'
    );
    expect(realtimeNotifier.notifyUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'message:new',
      expect.objectContaining({
        id: 'm1',
        chatId: 'c1',
        senderId: 'u1',
        senderName: 'Alice',
        text: 'Hello Bob!',
      })
    );
    expect(dto.senderName).toBe('Alice');
  });
});
