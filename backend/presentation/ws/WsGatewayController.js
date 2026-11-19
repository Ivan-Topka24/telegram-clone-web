const WebSocket = require('ws');
const { DomainException } = require('../../domain/exceptions');

const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Checks whether a value is a non-null plain object (not an Array).
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Manages WebSocket authentication, connection lifecycle, heartbeat pruning, and event dispatch.
 */
class WsGatewayController {
  /**
   * @param {object} deps
   * @param {import('http').Server} [deps.server]
   * @param {{ verifyToken: Function }} deps.jwtProvider
   * @param {import('../../domain/interfaces/IConnectionManager')} deps.connectionManager
   * @param {import('../../application/services/MessageService')} deps.messageService
   * @param {import('../../application/services/PresenceService')} deps.presenceService
   * @param {{ info: Function, warn: Function, error: Function }} deps.logger
   * @param {number} [deps.maxPayloadBytes=65536]
   * @param {number} [deps.heartbeatIntervalMs=30000]
   */
  constructor({
    server = null,
    jwtProvider,
    connectionManager,
    messageService,
    presenceService,
    logger,
    maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  }) {
    this.jwtProvider = jwtProvider;
    this.connectionManager = connectionManager;
    this.messageService = messageService;
    this.presenceService = presenceService;
    this.logger = logger;
    this.maxPayloadBytes = maxPayloadBytes;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.wss = null;
    this._heartbeatTimer = null;

    /** @type {Map<string, (user: { userId: string, username: string }, payload: object) => Promise<void>|void>} */
    this._eventHandlers = new Map();
    this._registerDefaultHandlers();

    if (server) {
      this.initialize(server);
    }
  }

  /**
   * Registers default WebSocket client-to-server event handlers.
   */
  _registerDefaultHandlers() {
    this.registerHandler('message:send', async (user, payload) => {
      await this.messageService.sendMessage({
        senderId: user.userId,
        chatId: payload.chatId,
        text: payload.text,
      });
    });

    this.registerHandler('chat:typing', async (user, payload) => {
      await this.presenceService.notifyTyping({
        userId: user.userId,
        username: user.username,
        chatId: payload.chatId,
      });
    });

    this.registerHandler('message:delete', async (user, payload) => {
      await this.messageService.deleteMessage({
        userId: user.userId,
        chatId: payload.chatId,
        messageId: payload.messageId,
      });
    });

    this.registerHandler('message:read', async (user, payload) => {
      await this.messageService.markMessagesAsRead({
        userId: user.userId,
        chatId: payload.chatId,
        upToMessageId: payload.upToMessageId || null,
      });
    });
  }

  /**
   * Registers or replaces a handler for a specific WebSocket event name (OCP).
   * @param {string} eventName
   * @param {(user: { userId: string, username: string }, payload: object) => Promise<void>|void} handler
   */
  registerHandler(eventName, handler) {
    this._eventHandlers.set(eventName, handler);
  }

  /**
   * Attaches the WebSocket server to an existing HTTP server on /ws.
   * @param {import('http').Server} server
   */
  initialize(server) {
    if (this.wss) {
      return;
    }

    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
      maxPayload: this.maxPayloadBytes,
    });

    this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));
    this.wss.on('error', (err) => {
      this.logger.error('WebSocket server error', err);
    });

    this._startHeartbeat();
  }

  /**
   * Starts periodic ping/pong checks to terminate dead TCP connections.
   */
  _startHeartbeat() {
    if (this._heartbeatTimer || this.heartbeatIntervalMs <= 0) {
      return;
    }

    this._heartbeatTimer = setInterval(() => {
      if (!this.wss) {
        return;
      }
      for (const client of this.wss.clients) {
        if (client.isAlive === false) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, this.heartbeatIntervalMs);

    if (typeof this._heartbeatTimer.unref === 'function') {
      this._heartbeatTimer.unref();
    }
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

      if (!decoded || !decoded.userId) {
        throw new Error('Token missing userId claim');
      }

      user = {
        userId: String(decoded.userId),
        username: decoded.username,
      };
    } catch (_err) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

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
   * Parses, validates, and dispatches an incoming WebSocket JSON frame.
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

    if (!isPlainObject(parsed) || typeof parsed.event !== 'string' || !parsed.event) {
      this._sendErrorFrame(ws, 'INVALID_PAYLOAD', 'WebSocket frame must include a string event');
      return;
    }

    if (parsed.payload !== undefined && !isPlainObject(parsed.payload)) {
      this._sendErrorFrame(ws, 'INVALID_PAYLOAD', 'WebSocket payload must be a JSON object');
      return;
    }

    const payload = parsed.payload || {};
    const handler = this._eventHandlers.get(parsed.event);

    if (!handler) {
      this._sendErrorFrame(
        ws,
        'UNKNOWN_EVENT',
        `Unsupported WebSocket event: ${String(parsed.event)}`
      );
      return;
    }

    await handler(user, payload);
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
   * Stops heartbeat timer, closes active client sockets, and closes the WebSocket server.
   * @returns {Promise<void>}
   */
  close() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    if (!this.wss) {
      return Promise.resolve();
    }

    const wss = this.wss;
    this.wss = null;

    for (const client of wss.clients) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1001, 'Server shutting down');
        } else {
          client.terminate();
        }
      } catch (_err) {
        // Ignore individual socket shutdown errors.
      }
    }

    return new Promise((resolve) => {
      wss.close(() => resolve());
    });
  }
}

module.exports = WsGatewayController;
