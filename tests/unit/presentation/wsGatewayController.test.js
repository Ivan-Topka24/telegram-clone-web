const WebSocket = require('ws');
const WsGatewayController = require('../../../backend/presentation/ws/WsGatewayController');

describe('Presentation Layer — WsGatewayController', () => {
  let jwtProvider;
  let connectionManager;
  let messageService;
  let presenceService;
  let logger;
  let controller;

  beforeEach(() => {
    jwtProvider = { verifyToken: jest.fn() };
    connectionManager = {
      addConnection: jest.fn(),
      removeConnection: jest.fn(),
    };
    messageService = {
      sendMessage: jest.fn().mockResolvedValue({}),
      deleteMessage: jest.fn().mockResolvedValue({}),
      markMessagesAsRead: jest.fn().mockResolvedValue({}),
    };
    presenceService = { notifyTyping: jest.fn().mockResolvedValue(undefined) };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    controller = new WsGatewayController({
      jwtProvider,
      connectionManager,
      messageService,
      presenceService,
      logger,
    });
  });

  test('handles null/non-object payloads gracefully with INVALID_PAYLOAD error frame', async () => {
    const ws = { readyState: WebSocket.OPEN, send: jest.fn() };
    const user = { userId: 'u1', username: 'alice' };

    await controller._handleMessage(
      ws,
      user,
      Buffer.from(JSON.stringify({ event: 'message:send', payload: null }))
    );

    expect(messageService.sendMessage).not.toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'error',
        payload: { code: 'INVALID_PAYLOAD', message: 'WebSocket payload must be a JSON object' },
      })
    );
  });

  test('delegates chat:typing to PresenceService and supports registering custom handlers (OCP)', async () => {
    const ws = { readyState: WebSocket.OPEN, send: jest.fn() };
    const user = { userId: 'u1', username: 'alice' };

    await controller._handleMessage(
      ws,
      user,
      Buffer.from(JSON.stringify({ event: 'chat:typing', payload: { chatId: 'c1' } }))
    );

    expect(presenceService.notifyTyping).toHaveBeenCalledWith({
      userId: 'u1',
      username: 'alice',
      chatId: 'c1',
    });

    const customHandler = jest.fn();
    controller.registerHandler('custom:ping', customHandler);
    await controller._handleMessage(
      ws,
      user,
      Buffer.from(JSON.stringify({ event: 'custom:ping', payload: { ok: true } }))
    );
    expect(customHandler).toHaveBeenCalledWith(user, { ok: true });
  });

  test('delegates message:delete and message:read to MessageService', async () => {
    const ws = { readyState: WebSocket.OPEN, send: jest.fn() };
    const user = { userId: 'u1', username: 'alice' };

    await controller._handleMessage(
      ws,
      user,
      Buffer.from(
        JSON.stringify({
          event: 'message:delete',
          payload: { chatId: 'c1', messageId: 'm1' },
        })
      )
    );
    expect(messageService.deleteMessage).toHaveBeenCalledWith({
      userId: 'u1',
      chatId: 'c1',
      messageId: 'm1',
    });

    await controller._handleMessage(
      ws,
      user,
      Buffer.from(
        JSON.stringify({
          event: 'message:read',
          payload: { chatId: 'c1', upToMessageId: 'm2' },
        })
      )
    );
    expect(messageService.markMessagesAsRead).toHaveBeenCalledWith({
      userId: 'u1',
      chatId: 'c1',
      upToMessageId: 'm2',
    });
  });
});
