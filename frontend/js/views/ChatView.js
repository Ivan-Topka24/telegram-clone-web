import { formatTime, getInitials } from '../core/formatters.js';
import { MessageDto, SendMessageRequestDto, TypingEventDto } from '../dtos/MessageDto.js';

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
    this._renderedChatId = null;
    this._renderedMessageIds = [];

    this.emptyStateEl = document.getElementById('empty-chat-state');
    this.activeContainerEl = document.getElementById('active-chat-container');
    this.headerAvatarEl = document.getElementById('chat-header-avatar');
    this.headerTitleEl = document.getElementById('chat-header-title');
    this.headerSubtitleEl = document.getElementById('chat-header-subtitle');
    this.typingIndicatorEl = document.getElementById('typing-indicator');
    this.messageListEl = document.getElementById('message-list');
    this.errorEl = document.getElementById('chat-error');
    this.messageFormEl = document.getElementById('message-form');
    this.messageInputEl = document.getElementById('message-input');
    this.messageTemplate = document.getElementById('message-item-template');

    this._bindEvents();
    this._bindSubscriptions();
  }

  _bindEvents() {
    this.messageFormEl.addEventListener('submit', (event) => this._handleSendMessage(event));
    this.messageInputEl.addEventListener('input', () => this._handleTyping());
    window.addEventListener('socket:error', (event) => {
      const message = event?.detail?.message || 'Failed to send message.';
      this._showError(message);
    });
  }

  _bindSubscriptions() {
    this.store.subscribe('activeChatId', (chatId) => this._onActiveChatChanged(chatId));
    this.store.subscribe('messages', (messages) => this._renderMessages(messages));
    this.store.subscribe('typingUsers', () => this._renderTypingIndicator());
    this.store.subscribe('chats', () => this._renderHeader());
  }

  _showError(message) {
    if (!this.errorEl) {
      return;
    }
    this.errorEl.textContent = message;
    this.errorEl.hidden = false;
  }

  _clearError() {
    if (!this.errorEl) {
      return;
    }
    this.errorEl.textContent = '';
    this.errorEl.hidden = true;
  }

  /**
   * Loads chat history and reveals the active conversation panel when activeChatId changes.
   * @param {string|null} chatId
   */
  async _onActiveChatChanged(chatId) {
    this._lastTypingSentAt = 0;
    this._clearError();

    if (!chatId) {
      this._renderedChatId = null;
      this._renderedMessageIds = [];
      this.activeContainerEl.hidden = true;
      this.emptyStateEl.hidden = false;
      this.store.setState('messages', []);
      return;
    }

    this.emptyStateEl.hidden = true;
    this.activeContainerEl.hidden = false;
    this._renderHeader();
    this._renderTypingIndicator();
    this._renderedChatId = chatId;
    this._renderedMessageIds = [];
    this.store.setState('messages', []);

    const loadToken = ++this._activeLoadToken;

    try {
      const rawMessages = await this.httpClient.get(`/chats/${encodeURIComponent(chatId)}/messages`);
      if (loadToken !== this._activeLoadToken || this.store.state.activeChatId !== chatId) {
        return;
      }
      const messageModels = Array.isArray(rawMessages)
        ? rawMessages.map((raw) => MessageDto.fromPayload(raw).toModel())
        : [];
      this.store.setState('messages', messageModels);
      this.messageInputEl.focus();
    } catch (err) {
      if (loadToken === this._activeLoadToken) {
        this.store.setState('messages', []);
        this._showError(err?.message || 'Failed to load message history.');
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
   * Creates a DOM node for a single message using #message-item-template.
   * @param {object} msg
   * @param {string|undefined} currentUserId
   * @returns {DocumentFragment}
   */
  _buildMessageNode(msg, currentUserId) {
    const clone = this.messageTemplate.content.cloneNode(true);
    const rowEl = clone.querySelector('.message-row');
    const isOwn = typeof msg.isOwn === 'function'
      ? msg.isOwn(currentUserId)
      : Boolean(currentUserId && msg.senderId === currentUserId);
    rowEl.classList.add(isOwn ? 'own' : 'incoming');
    rowEl.dataset.messageId = msg.id || '';

    clone.querySelector('.message-sender').textContent = msg.senderName || 'User';
    clone.querySelector('.message-text').textContent = msg.text;
    clone.querySelector('.message-time').textContent = formatTime(msg.createdAt);

    return clone;
  }

  /**
   * Incrementally appends new messages or performs full render when chat/list changes.
   * @param {Array<object>} messages
   */
  _renderMessages(messages) {
    const currentUserId = this.store.state.currentUser?.id;
    const activeChatId = this.store.state.activeChatId;

    if (!Array.isArray(messages) || messages.length === 0) {
      this.messageListEl.replaceChildren();
      this._renderedMessageIds = [];
      return;
    }

    const canAppendIncrementally =
      this._renderedChatId === activeChatId &&
      this._renderedMessageIds.length > 0 &&
      messages.length > this._renderedMessageIds.length &&
      this._renderedMessageIds.every((id, idx) => messages[idx]?.id === id);

    const startIndex = canAppendIncrementally ? this._renderedMessageIds.length : 0;
    if (!canAppendIncrementally) {
      this.messageListEl.replaceChildren();
      this._renderedMessageIds = [];
    }

    const fragment = document.createDocumentFragment();
    for (let i = startIndex; i < messages.length; i += 1) {
      const msg = messages[i];
      fragment.appendChild(this._buildMessageNode(msg, currentUserId));
      this._renderedMessageIds.push(msg.id);
    }

    this._renderedChatId = activeChatId;
    this.messageListEl.appendChild(fragment);
    this.messageListEl.scrollTop = this.messageListEl.scrollHeight;
  }

  /**
   * Dispatches message:send over WebSocket on form submission.
   * @param {SubmitEvent} event
   */
  _handleSendMessage(event) {
    event.preventDefault();
    this._clearError();

    const activeChatId = this.store.state.activeChatId;
    const text = this.messageInputEl.value.trim();

    if (!activeChatId || !text) {
      return;
    }

    const sendDto = new SendMessageRequestDto({
      chatId: activeChatId,
      text,
    });
    const sent = this.socketClient.send('message:send', sendDto);

    if (!sent) {
      this._showError('Connection lost. Reconnecting to server...');
      this.messageInputEl.focus();
      return;
    }

    this.messageInputEl.value = '';
    this._lastTypingSentAt = 0;
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
    this.socketClient.send('chat:typing', new TypingEventDto({ chatId: activeChatId }));
  }
}
