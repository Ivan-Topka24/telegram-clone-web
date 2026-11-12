const WebSocket = require('ws');
const { DomainException } = require('../../domain/exceptions');

/**
 * Manages WebSocket authentication, connection lifecycle, and incoming real-time events.
 */
class WsGatewayController {
  /**
   * @param {object} deps
   * @param {import('http').Server} [deps.server]
   * @param {{ verifyToken: Function }} deps.jwtProvider
   * @param {import('../../infrastructure/realtime/ConnectionManager')} deps.connectionManager
   * @param {import('../../application/services/MessageService')} deps.messageService
   * @param {import('../../domain/interfaces/IChatRepository')} deps.chatRepository
   * @param {import('../../domain/interfaces/IRealtimeNotifier')} deps.realtimeNotifier
   * @param {{ info: Function, warn: Function, error: Function }} deps.logger
   */
  constructor({
    server = null,
    jwtProvider,
    connectionManager,
    messageService,
    chatRepository,
    realtimeNotifier,
    logger,
  }) {
    this.jwtProvider = jwtProvider;
    this.connectionManager = connectionManager;
    this.messageService = messageService;
    this.chatRepository = chatRepository;
    this.realtimeNotifier = realtimeNotifier;
    this.logger = logger;
    this.wss = null;

    if (server) {
      this.initialize(server);
    }
  }

  /**
   * Attaches the WebSocket server to an existing HTTP server on /ws.
   * @param {import('http').Server} server
   */
  initialize(server) {
    if (this.wss) {
      return;
    }

    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));
    this.wss.on('error', (err) => {
      this.logger.error('WebSocket server error', err);
    });
  }

  /**
   * Authenticates an incoming WebSocket handshake and binds socket event listeners.
   * @param {import('ws')} ws
   * @param {import('http').IncomingMessage} req
   */
  _handleConnection(ws, req) {
    let user;
    try {
      const requestUrl = new URL(req.url || '/', 'http://localhost');
      const token = requestUrl.searchParams.get('token');
      const decoded = this.jwtProvider.verifyToken(token);
      user = {
        userId: String(decoded.userId),
        username: decoded.username,
      };
    } catch (_err) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    this.connectionManager.addConnection(user.userId, ws);
    this.logger.info('WebSocket connected', { userId: user.userId, username: user.username });

    ws.on('message', (rawData) => {
      this._handleMessage(ws, user, rawData).catch((err) => {
        this._sendSocketError(ws, err);
      });
    });

    ws.on('close', () => {
      this.connectionManager.removeConnection(user.userId, ws);
      this.logger.info('WebSocket disconnected', { userId: user.userId });
    });

    ws.on('error', (err) => {
      this.logger.warn('WebSocket client error', { userId: user.userId, message: err.message });
      this.connectionManager.removeConnection(user.userId, ws);
    });
  }

  /**
   * Parses and dispatches an incoming WebSocket JSON frame.
   * @param {import('ws')} ws
   * @param {{ userId: string, username: string }} user
   * @param {import('ws').RawData} rawData
   */
  async _handleMessage(ws, user, rawData) {
    let parsed;
    try {
      parsed = JSON.parse(rawData.toString());
    } catch (_err) {
      this._sendErrorFrame(ws, 'INVALID_JSON', 'Invalid WebSocket JSON payload');
      return;
    }

    const { event, payload = {} } = parsed || {};

    if (event === 'message:send') {
      await this.messageService.sendMessage({
        senderId: user.userId,
        chatId: payload.chatId,
        text: payload.text,
      });
      return;
    }

    if (event === 'chat:typing') {
      if (!payload.chatId) {
        return;
      }

      const chat = await this.chatRepository.findById(payload.chatId);
      if (!chat || !chat.hasMember(user.userId)) {
        return;
      }

      const recipientIds = chat.members
        .map((member) => String(member.userId))
        .filter((memberId) => memberId !== user.userId);

      if (recipientIds.length > 0) {
        this.realtimeNotifier.notifyUsers(recipientIds, 'chat:typing', {
          chatId: chat.id,
          userId: user.userId,
          username: user.username,
        });
      }
      return;
    }

    this._sendErrorFrame(ws, 'UNKNOWN_EVENT', `Unsupported WebSocket event: ${String(event)}`);
  }

  /**
   * Sends a structured error payload back to the originating socket.
   * @param {import('ws')} ws
   * @param {Error} err
   */
  _sendSocketError(ws, err) {
    if (err instanceof DomainException) {
      this._sendErrorFrame(ws, err.code, err.message);
      return;
    }

    this.logger.error('Unexpected WebSocket message error', err);
    this._sendErrorFrame(ws, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }

  /**
   * Sends an error JSON frame if the socket is open.
   * @param {import('ws')} ws
   * @param {string} code
   * @param {string} message
   */
  _sendErrorFrame(ws, code, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'error', payload: { code, message } }));
    }
  }

  /**
   * Closes the WebSocket server during graceful shutdown.
   * @returns {Promise<void>}
   */
  close() {
    if (!this.wss) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.wss.close(() => resolve());
    });
  }
}

module.exports = WsGatewayController;
