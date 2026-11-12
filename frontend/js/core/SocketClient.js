const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 10000;
const TYPING_TIMEOUT_MS = 3000;

/**
 * WebSocket client managing real-time messaging, reconnection, and Store synchronization.
 */
export class SocketClient {
  /**
   * @param {import('./Store.js').Store} store
   * @param {object} [options]
   * @param {(errPayload: { code?: string, message?: string }) => void} [options.onError]
   * @param {(message: object) => void} [options.onUnknownChatMessage]
   * @param {() => void} [options.onUnauthorized]
   * @param {EventTarget|null} [options.eventTarget]
   */
  constructor(
    store,
    {
      onError = null,
      onUnknownChatMessage = null,
      onUnauthorized = null,
      eventTarget = typeof window !== 'undefined' ? window : null,
    } = {}
  ) {
    this.store = store;
    this._onError = onError;
    this._onUnknownChatMessage = onUnknownChatMessage;
    this._onUnauthorized = onUnauthorized;
    this._eventTarget = eventTarget;
    this._ws = null;
    this._token = null;
    this._manuallyClosed = false;
    this._reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this._reconnectTimer = null;
    this._typingTimers = new Map();
  }

  /**
   * Registers a callback for incoming message:new on chats not yet in store.chats.
   * @param {(message: object) => void} handler
   */
  setUnknownChatHandler(handler) {
    this._onUnknownChatMessage = handler;
  }

  /**
   * Opens an authenticated WebSocket connection to /ws.
   * @param {string} token
   */
  connect(token) {
    if (!token) {
      return;
    }

    this._token = token;
    this._manuallyClosed = false;
    this._clearReconnectTimer();

    if (
      this._ws &&
      (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)
    ) {
      this._ws.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    this._ws = ws;

    ws.addEventListener('open', () => {
      this._reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    });

    ws.addEventListener('message', (event) => {
      this._handleMessage(event.data);
    });

    ws.addEventListener('close', (event) => {
      if (this._ws === ws) {
        this._ws = null;
      }

      if (event.code === 4001) {
        this._manuallyClosed = true;
        if (this._onUnauthorized) {
          this._onUnauthorized();
        } else if (this._eventTarget && typeof CustomEvent !== 'undefined') {
          this._eventTarget.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        return;
      }

      if (!this._manuallyClosed && this._token) {
        this._scheduleReconnect();
      }
    });

    ws.addEventListener('error', () => {
      // Close event handles cleanup and reconnection scheduling.
    });
  }

  /**
   * Closes the active WebSocket connection and disables auto-reconnect.
   */
  disconnect() {
    this._manuallyClosed = true;
    this._token = null;
    this._clearReconnectTimer();
    this._clearAllTypingTimers();

    if (this._ws) {
      this._ws.close(1000, 'Client disconnected');
      this._ws = null;
    }
  }

  /**
   * Sends a JSON event frame over the active WebSocket connection.
   * @param {string} event
   * @param {any} payload
   * @returns {boolean}
   */
  send(event, payload) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    this._ws.send(JSON.stringify({ event, payload }));
    return true;
  }

  /**
   * Routes incoming server WebSocket events into Store state updates or error notifications.
   * @param {string} rawData
   */
  _handleMessage(rawData) {
    let parsed;
    try {
      parsed = JSON.parse(rawData);
    } catch (_err) {
      return;
    }

    const { event, payload } = parsed || {};
    if (!event) {
      return;
    }

    if (event === 'message:new') {
      this._onNewMessage(payload);
    } else if (event === 'chat:created') {
      this._onChatCreated(payload);
    } else if (event === 'chat:typing') {
      this._onChatTyping(payload);
    } else if (event === 'error') {
      this._onServerError(payload);
    }
  }

  /**
   * Surfaces server-sent WebSocket error frames to listeners.
   * @param {{ code?: string, message?: string }} payload
   */
  _onServerError(payload) {
    const errorInfo = {
      code: payload?.code || 'WS_ERROR',
      message: payload?.message || 'WebSocket request failed.',
    };

    if (this._onError) {
      this._onError(errorInfo);
    }

    if (this._eventTarget && typeof CustomEvent !== 'undefined') {
      this._eventTarget.dispatchEvent(new CustomEvent('socket:error', { detail: errorInfo }));
    }
  }

  /**
   * Updates chat list preview/order and appends to active chat messages.
   * @param {object} message
   */
  _onNewMessage(message) {
    if (!message || !message.chatId) {
      return;
    }

    const chats = [...this.store.state.chats];
    const existingIndex = chats.findIndex((c) => c.id === message.chatId);

    if (existingIndex !== -1) {
      const updatedChat = {
        ...chats[existingIndex],
        lastMessage: {
          text: message.text,
          senderId: message.senderId,
          createdAt: message.createdAt,
        },
        updatedAt: message.createdAt,
      };
      chats.splice(existingIndex, 1);
      chats.unshift(updatedChat);
      this.store.setState('chats', chats);
    } else if (this._onUnknownChatMessage) {
      this._onUnknownChatMessage(message);
    }

    if (message.chatId === this.store.state.activeChatId) {
      const currentMessages = this.store.state.messages;
      const alreadyExists = currentMessages.some((m) => m.id === message.id);
      if (!alreadyExists) {
        this.store.setState('messages', [...currentMessages, message]);
      }
    }

    this._clearTypingUser(message.chatId, message.senderId);
  }

  /**
   * Inserts a newly created chat into the sidebar list if not already present.
   * @param {object} chat
   */
  _onChatCreated(chat) {
    if (!chat || !chat.id) {
      return;
    }

    const chats = this.store.state.chats;
    if (chats.some((c) => c.id === chat.id)) {
      return;
    }

    this.store.setState('chats', [chat, ...chats]);
  }

  /**
   * Tracks transient typing indicator state for a chat and auto-clears after timeout.
   * @param {{ chatId: string, userId: string, username: string }} payload
   */
  _onChatTyping(payload) {
    if (!payload || !payload.chatId || !payload.userId) {
      return;
    }

    const { chatId, userId, username } = payload;
    const timerKey = `${chatId}:${userId}`;

    if (this._typingTimers.has(timerKey)) {
      clearTimeout(this._typingTimers.get(timerKey));
    }

    const currentTyping = { ...this.store.state.typingUsers };
    const chatTypers = { ...(currentTyping[chatId] || {}), [userId]: username };
    currentTyping[chatId] = chatTypers;
    this.store.setState('typingUsers', currentTyping);

    const timer = setTimeout(() => {
      this._clearTypingUser(chatId, userId);
    }, TYPING_TIMEOUT_MS);
    this._typingTimers.set(timerKey, timer);
  }

  /**
   * Removes a user's typing indicator for a given chat.
   * @param {string} chatId
   * @param {string} userId
   */
  _clearTypingUser(chatId, userId) {
    const timerKey = `${chatId}:${userId}`;
    if (this._typingTimers.has(timerKey)) {
      clearTimeout(this._typingTimers.get(timerKey));
      this._typingTimers.delete(timerKey);
    }

    const currentTyping = { ...this.store.state.typingUsers };
    if (!currentTyping[chatId] || !currentTyping[chatId][userId]) {
      return;
    }

    const chatTypers = { ...currentTyping[chatId] };
    delete chatTypers[userId];

    if (Object.keys(chatTypers).length === 0) {
      delete currentTyping[chatId];
    } else {
      currentTyping[chatId] = chatTypers;
    }

    this.store.setState('typingUsers', currentTyping);
  }

  _scheduleReconnect() {
    this._clearReconnectTimer();
    const delay = this._reconnectDelay;
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);

    this._reconnectTimer = setTimeout(() => {
      if (!this._manuallyClosed && this._token) {
        this.connect(this._token);
      }
    }, delay);
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _clearAllTypingTimers() {
    for (const timer of this._typingTimers.values()) {
      clearTimeout(timer);
    }
    this._typingTimers.clear();
  }
}
