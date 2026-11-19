const User = require('../../../backend/domain/models/User');
const Chat = require('../../../backend/domain/models/Chat');
const Message = require('../../../backend/domain/models/Message');
const MessageService = require('../../../backend/application/services/MessageService');
const {
  ForbiddenException,
  NotFoundException,
  ValidationException,
} = require('../../../backend/domain/exceptions');

describe('Application Layer — MessageService', () => {
  let unitOfWork;
  let chatRepository;
  let messageRepository;
  let userRepository;
  let realtimeNotifier;
  let logger;
  let messageService;

  const chat = new Chat({
    id: 'c1',
    type: 'direct',
    members: [{ userId: 'u1', role: 'member' }, { userId: 'u2', role: 'member' }],
  });

  beforeEach(() => {
    unitOfWork = {
      execute: jest.fn(async (cb) => cb()),
    };
    chatRepository = {
      findById: jest.fn(),
      updateLastMessage: jest.fn(),
    };
    messageRepository = {
      create: jest.fn(),
      findByChatId: jest.fn(),
      findById: jest.fn(),
      findLatestByChatId: jest.fn(),
      deleteById: jest.fn(),
      markAsReadByUser: jest.fn(),
    };
    userRepository = {
      findById: jest.fn(),
      findByIds: jest.fn(),
    };
    realtimeNotifier = {
      notifyUsers: jest.fn(),
    };
    logger = {
      warn: jest.fn(),
    };

    messageService = new MessageService({
      unitOfWork,
      chatRepository,
      messageRepository,
      userRepository,
      realtimeNotifier,
      logger,
    });
  });

  test('sendMessage() throws ForbiddenException if sender is not a chat member', async () => {
    chatRepository.findById.mockResolvedValue(chat);

    await expect(
      messageService.sendMessage({ senderId: 'u99', chatId: 'c1', text: 'Intruder' })
    ).rejects.toThrow(ForbiddenException);
    expect(unitOfWork.execute).not.toHaveBeenCalled();
  });

  test('sendMessage() throws ValidationException for empty or oversized text', async () => {
    await expect(
      messageService.sendMessage({ senderId: 'u1', chatId: 'c1', text: '   ' })
    ).rejects.toThrow(ValidationException);

    await expect(
      messageService.sendMessage({ senderId: 'u1', chatId: 'c1', text: 'a'.repeat(4097) })
    ).rejects.toThrow(ValidationException);
  });

  test('sendMessage() runs UnitOfWork without leaking session, updates lastMessage, and broadcasts message:new', async () => {
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
      expect.objectContaining({ chatId: 'c1', senderId: 'u1', text: 'Hello Bob!' })
    );
    expect(chatRepository.updateLastMessage).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ text: 'Hello Bob!', senderId: 'u1' })
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

  test('sendMessage() isolates realtime notification errors after persistence', async () => {
    chatRepository.findById.mockResolvedValue(chat);
    userRepository.findById.mockResolvedValue(
      new User({ id: 'u1', username: 'alice', displayName: 'Alice' })
    );
    messageRepository.create.mockResolvedValue(
      new Message({ id: 'm1', chatId: 'c1', senderId: 'u1', text: 'Hi', createdAt: new Date() })
    );
    realtimeNotifier.notifyUsers.mockImplementation(() => {
      throw new Error('Socket failure');
    });

    const dto = await messageService.sendMessage({ senderId: 'u1', chatId: 'c1', text: 'Hi' });
    expect(dto.id).toBe('m1');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('getChatHistory() passes clamped pagination limit and before cursor', async () => {
    chatRepository.findById.mockResolvedValue(chat);
    messageRepository.findByChatId.mockResolvedValue([]);

    await messageService.getChatHistory('u1', 'c1', {
      limit: '250',
      before: '2026-01-01T00:00:00.000Z',
    });

    expect(messageRepository.findByChatId).toHaveBeenCalledWith(
      'c1',
      100,
      new Date('2026-01-01T00:00:00.000Z')
    );

    await expect(
      messageService.getChatHistory('u1', 'c1', { before: 'not-a-date' })
    ).rejects.toThrow(ValidationException);
  });

  test('deleteMessage() deletes author message in UnitOfWork, updates lastMessage, and broadcasts message:deleted', async () => {
    const prevCreatedAt = new Date('2026-01-01T10:00:00.000Z');
    chatRepository.findById.mockResolvedValue(chat);
    messageRepository.findById.mockResolvedValue(
      new Message({ id: 'm2', chatId: 'c1', senderId: 'u1', text: 'Latest' })
    );
    messageRepository.deleteById.mockResolvedValue(true);
    messageRepository.findLatestByChatId.mockResolvedValue(
      new Message({
        id: 'm1',
        chatId: 'c1',
        senderId: 'u2',
        text: 'Previous',
        createdAt: prevCreatedAt,
      })
    );

    const res = await messageService.deleteMessage({
      userId: 'u1',
      chatId: 'c1',
      messageId: 'm2',
    });

    expect(unitOfWork.execute).toHaveBeenCalledTimes(1);
    expect(messageRepository.deleteById).toHaveBeenCalledWith('m2');
    expect(chatRepository.updateLastMessage).toHaveBeenCalledWith('c1', {
      text: 'Previous',
      senderId: 'u2',
      createdAt: prevCreatedAt,
    });
    expect(realtimeNotifier.notifyUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'message:deleted',
      expect.objectContaining({ chatId: 'c1', messageId: 'm2' })
    );
    expect(res.lastMessage.text).toBe('Previous');

    // Deleting when no messages remain sets lastMessage to null
    messageRepository.findLatestByChatId.mockResolvedValue(null);
    const emptyRes = await messageService.deleteMessage({
      userId: 'u1',
      chatId: 'c1',
      messageId: 'm2',
    });
    expect(chatRepository.updateLastMessage).toHaveBeenCalledWith('c1', null);
    expect(emptyRes.lastMessage).toBeNull();
  });

  test('deleteMessage() rejects non-authors with ForbiddenException and missing messages with NotFoundException', async () => {
    chatRepository.findById.mockResolvedValue(chat);
    messageRepository.findById.mockResolvedValue(
      new Message({ id: 'm1', chatId: 'c1', senderId: 'u2', text: 'Bob msg' })
    );

    await expect(
      messageService.deleteMessage({ userId: 'u1', chatId: 'c1', messageId: 'm1' })
    ).rejects.toThrow(ForbiddenException);

    messageRepository.findById.mockResolvedValue(null);
    await expect(
      messageService.deleteMessage({ userId: 'u1', chatId: 'c1', messageId: 'missing' })
    ).rejects.toThrow(NotFoundException);
  });

  test('markMessagesAsRead() marks unread messages and broadcasts message:read only when updates occur', async () => {
    chatRepository.findById.mockResolvedValue(chat);
    messageRepository.findById.mockResolvedValue(
      new Message({
        id: 'm1',
        chatId: 'c1',
        senderId: 'u1',
        text: 'Hi',
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
      })
    );
    messageRepository.markAsReadByUser.mockResolvedValue(['m1']);

    const res = await messageService.markMessagesAsRead({
      userId: 'u2',
      chatId: 'c1',
      upToMessageId: 'm1',
    });

    expect(res).toEqual({ chatId: 'c1', readerId: 'u2', messageIds: ['m1'] });
    expect(realtimeNotifier.notifyUsers).toHaveBeenCalledWith(['u1', 'u2'], 'message:read', res);

    realtimeNotifier.notifyUsers.mockClear();
    messageRepository.markAsReadByUser.mockResolvedValue([]);
    const emptyRes = await messageService.markMessagesAsRead({ userId: 'u2', chatId: 'c1' });
    expect(emptyRes.messageIds).toEqual([]);
    expect(realtimeNotifier.notifyUsers).not.toHaveBeenCalled();
  });
});
