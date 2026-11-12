import { formatTime, getInitials } from '../core/formatters.js';

const TYPING_THROTTLE_MS = 1500;

/**
 * Manages the active conversation panel, message history, sending, and typing indicators.
 */
export class ChatView {
  /**
   * @param {object} deps
   * @param {import('../core/Store.js').Store} deps.store
   * @param {import('../core/HttpClient.js').HttpClient} deps.httpClient
   * @param {import('../core/SocketClient.js').SocketClient} deps.socketClient
   */
  constructor({ store, httpClient, socketClient }) {
    this.store = store;
    this.httpClient = httpClient;
    this.socketClient = socketClient;
    this._lastTypingSentAt = 0;
    this._activeLoadToken = 0;

    this.emptyStateEl = document.getElementById('empty-chat-state');
    this.activeContainerEl = document.getElementById('active-chat-container');
    this.headerAvatarEl = document.getElementById('chat-header-avatar');
    this.headerTitleEl = document.getElementById('chat-header-title');
    this.headerSubtitleEl = document.getElementById('chat-header-subtitle');
    this.typingIndicatorEl = document.getElementById('typing-indicator');
    this.messageListEl = document.getElementById('message-list');
    this.messageFormEl = document.getElementById('message-form');
    this.messageInputEl = document.getElementById('message-input');
    this.messageTemplate = document.getElementById('message-item-template');

    this._bindEvents();
    this._bindSubscriptions();
  }

  _bindEvents() {
    this.messageFormEl.addEventListener('submit', (event) => this._handleSendMessage(event));
    this.messageInputEl.addEventListener('input', () => this._handleTyping());
  }

  _bindSubscriptions() {
    this.store.subscribe('activeChatId', (chatId) => this._onActiveChatChanged(chatId));
    this.store.subscribe('messages', (messages) => this._renderMessages(messages));
    this.store.subscribe('typingUsers', () => this._renderTypingIndicator());
    this.store.subscribe('chats', () => this._renderHeader());
  }

  /**
   * Loads chat history and reveals the active conversation panel when activeChatId changes.
   * @param {string|null} chatId
   */
  async _onActiveChatChanged(chatId) {
    this._lastTypingSentAt = 0;

    if (!chatId) {
      this.activeContainerEl.hidden = true;
      this.emptyStateEl.hidden = false;
      this.store.setState('messages', []);
      return;
    }

    this.emptyStateEl.hidden = true;
    this.activeContainerEl.hidden = false;
    this._renderHeader();
    this._renderTypingIndicator();
    this.store.setState('messages', []);

    const loadToken = ++this._activeLoadToken;

    try {
      const messages = await this.httpClient.get(`/chats/${encodeURIComponent(chatId)}/messages`);
      if (loadToken !== this._activeLoadToken || this.store.state.activeChatId !== chatId) {
        return;
      }
      this.store.setState('messages', Array.isArray(messages) ? messages : []);
      this.messageInputEl.focus();
    } catch (_err) {
      if (loadToken === this._activeLoadToken) {
        this.store.setState('messages', []);
      }
    }
  }

  /**
   * Updates the chat header title, avatar, and member/username subtitle.
   */
  _renderHeader() {
    const { activeChatId, chats } = this.store.state;
    if (!activeChatId) {
      return;
    }

    const chat = chats.find((c) => c.id === activeChatId);
    if (!chat) {
      return;
    }

    const title = chat.displayTitle || chat.title || 'Chat';
    this.headerAvatarEl.textContent = getInitials(title);
    this.headerTitleEl.textContent = title;

    if (chat.type === 'group') {
      const count = Array.isArray(chat.members) ? chat.members.length : 0;
      this.headerSubtitleEl.textContent = `${count} members`;
    } else if (chat.peer?.username) {
      this.headerSubtitleEl.textContent = `@${chat.peer.username}`;
    } else {
      this.headerSubtitleEl.textContent = 'Direct chat';
    }
  }

  /**
   * Displays active typing usernames for the current chat.
   */
  _renderTypingIndicator() {
    const { activeChatId, typingUsers, currentUser } = this.store.state;
    const chatTypers = activeChatId ? typingUsers[activeChatId] : null;

    if (!chatTypers) {
      this.typingIndicatorEl.textContent = '';
      this.typingIndicatorEl.hidden = true;
      return;
    }

    const names = Object.entries(chatTypers)
      .filter(([userId]) => userId !== currentUser?.id)
      .map(([, username]) => username);

    if (names.length === 0) {
      this.typingIndicatorEl.textContent = '';
      this.typingIndicatorEl.hidden = true;
      return;
    }

    this.typingIndicatorEl.textContent =
      names.length === 1 ? `${names[0]} is typing...` : `${names.join(', ')} are typing...`;
    this.typingIndicatorEl.hidden = false;
  }

  /**
   * Renders all messages in the active chat using #message-item-template and scrolls to bottom.
   * @param {Array<object>} messages
   */
  _renderMessages(messages) {
    const currentUserId = this.store.state.currentUser?.id;
    this.messageListEl.replaceChildren();

    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const msg of messages) {
      const clone = this.messageTemplate.content.cloneNode(true);
      const rowEl = clone.querySelector('.message-row');
      const isOwn = Boolean(currentUserId && msg.senderId === currentUserId);
      rowEl.classList.add(isOwn ? 'own' : 'incoming');

      clone.querySelector('.message-sender').textContent = msg.senderName || 'User';
      clone.querySelector('.message-text').textContent = msg.text;
      clone.querySelector('.message-time').textContent = formatTime(msg.createdAt);

      fragment.appendChild(clone);
    }

    this.messageListEl.appendChild(fragment);
    this.messageListEl.scrollTop = this.messageListEl.scrollHeight;
  }

  /**
   * Dispatches message:send over WebSocket on form submission.
   * @param {SubmitEvent} event
   */
  _handleSendMessage(event) {
    event.preventDefault();
    const activeChatId = this.store.state.activeChatId;
    const text = this.messageInputEl.value.trim();

    if (!activeChatId || !text) {
      return;
    }

    const sent = this.socketClient.send('message:send', {
      chatId: activeChatId,
      text,
    });

    if (sent) {
      this.messageInputEl.value = '';
      this._lastTypingSentAt = 0;
    }
    this.messageInputEl.focus();
  }

  /**
   * Throttles chat:typing WebSocket events while the user types.
   */
  _handleTyping() {
    const activeChatId = this.store.state.activeChatId;
    if (!activeChatId || !this.messageInputEl.value.trim()) {
      return;
    }

    const now = Date.now();
    if (now - this._lastTypingSentAt < TYPING_THROTTLE_MS) {
      return;
    }

    this._lastTypingSentAt = now;
    this.socketClient.send('chat:typing', { chatId: activeChatId });
  }
}
