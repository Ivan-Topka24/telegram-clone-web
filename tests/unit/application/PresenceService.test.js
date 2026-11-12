const Chat = require('../../../backend/domain/models/Chat');
const PresenceService = require('../../../backend/application/services/PresenceService');
const { TypingIndicatorDto } = require('../../../backend/application/dtos');

describe('Application Layer — PresenceService', () => {
  let chatRepository;
  let realtimeNotifier;
  let presenceService;

  beforeEach(() => {
    chatRepository = { findById: jest.fn() };
    realtimeNotifier = { notifyUsers: jest.fn() };
    presenceService = new PresenceService({ chatRepository, realtimeNotifier });
  });

  test('does nothing if chat does not exist or actor is not a member', async () => {
    chatRepository.findById.mockResolvedValueOnce(null);
    await presenceService.notifyTyping({ userId: 'u1', username: 'alice', chatId: 'c1' });

    chatRepository.findById.mockResolvedValueOnce(
      new Chat({ id: 'c1', type: 'direct', members: ['u2', 'u3'] })
    );
    await presenceService.notifyTyping({ userId: 'u1', username: 'alice', chatId: 'c1' });

    expect(realtimeNotifier.notifyUsers).not.toHaveBeenCalled();
  });

  test('notifies all other chat members with a TypingIndicatorDto when actor is a valid member', async () => {
    chatRepository.findById.mockResolvedValue(
      new Chat({
        id: 'c1',
        type: 'group',
        title: 'Team',
        members: [
          { userId: 'u1', role: 'owner' },
          { userId: 'u2', role: 'member' },
          { userId: 'u3', role: 'member' },
        ],
      })
    );

    await presenceService.notifyTyping({ userId: 'u1', username: 'alice', chatId: 'c1' });

    expect(realtimeNotifier.notifyUsers).toHaveBeenCalledWith(
      ['u2', 'u3'],
      'chat:typing',
      expect.any(TypingIndicatorDto)
    );
    const emittedDto = realtimeNotifier.notifyUsers.mock.calls[0][2];
    expect(emittedDto).toEqual(
      new TypingIndicatorDto({ chatId: 'c1', userId: 'u1', username: 'alice' })
    );
  });
});
