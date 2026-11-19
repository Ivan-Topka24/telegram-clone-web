import { formatTime, getInitials } from '../core/formatters.js';
import {
  MarkReadEventDto,
  MessageModel,
  SendMessageRequestDto,
} from '../models/MessageModel.js';
import { TypingEventDto } from '../models/TypingIndicatorDto.js';

const TYPING_THROTTLE_MS = 1500;

/**
 * Manages the active conversation panel, message history, sending, deletion, read receipts, and typing indicators.
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
    this._lastReadSentForMessageId = null;

    this.emptyStateEl = document.getElementById('empty-chat-state');
    this.activeContainerEl = document.getElementById('active-chat-container');
    this.headerAvatarEl = document.getElementById('chat-header-avatar');
    this.headerTitleEl = document.getElementById('chat-header-title');
    this.headerSubtitleEl = document.getElementById('chat-header-subtitle');
    this.deleteGroupBtnEl = document.getElementById('delete-group-btn');
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
    this.deleteGroupBtnEl?.addEventListener('click', () => this._handleDeleteGroup());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this._notifyMessagesRead();
      }
    });
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
    this.store.subscribe('currentUser', () => this._renderHeader());
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
    this._lastReadSentForMessageId = null;
    this._clearError();

    if (!chatId) {
      this._renderedChatId = null;
      this._renderedMessageIds = [];
      if (this.deleteGroupBtnEl) {
        this.deleteGroupBtnEl.hidden = true;
      }
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
        ? rawMessages.map((raw) => MessageModel.fromPayload(raw))
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
   * Updates the chat header title, avatar, member/username subtitle, and owner Delete Group button.
   */
  _renderHeader() {
    const { activeChatId, chats, currentUser } = this.store.state;
    if (!activeChatId) {
      if (this.deleteGroupBtnEl) {
        this.deleteGroupBtnEl.hidden = true;
      }
      return;
    }

    const chat = chats.find((c) => c.id === activeChatId);
    if (!chat) {
      if (this.deleteGroupBtnEl) {
        this.deleteGroupBtnEl.hidden = true;
      }
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

    if (this.deleteGroupBtnEl) {
      const currentUserId = currentUser?.id;
      const canDeleteChat =
        typeof chat.canDelete === 'function'
          ? chat.canDelete(currentUserId)
          : Boolean(
              currentUserId &&
                (chat.type === 'group'
                  ? Array.isArray(chat.members) &&
                    chat.members.some(
                      (m) => String(m.userId) === String(currentUserId) && m.role === 'owner'
                    )
                  : !Array.isArray(chat.members) ||
                    chat.members.length === 0 ||
                    chat.members.some((m) => String(m.userId) === String(currentUserId)))
            );
      this.deleteGroupBtnEl.hidden = !canDeleteChat;
      this.deleteGroupBtnEl.textContent = chat.type === 'group' ? 'Delete Group' : 'Delete Chat';
      this.deleteGroupBtnEl.title =
        chat.type === 'group' ? 'Delete this group chat' : 'Delete this chat';
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
   * Applies viewed / unviewed checkmarks to an own message status element.
   * @param {HTMLElement|null} statusEl
   * @param {object} msg
   */
  _applyMessageReadStatus(statusEl, msg) {
    if (!statusEl) {
      return;
    }
    const viewed =
      typeof msg.isViewed === 'function'
        ? msg.isViewed()
        : Array.isArray(msg.readBy) &&
          msg.readBy.some((id) => String(id) !== String(msg.senderId));

    statusEl.hidden = false;
    statusEl.textContent = viewed ? '\u2713\u2713' : '\u2713';
    statusEl.classList.toggle('seen', viewed);
    statusEl.title = viewed ? 'Viewed' : 'Sent (not viewed yet)';
    statusEl.setAttribute('aria-label', viewed ? 'Viewed' : 'Sent, not viewed yet');
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
    const isOwn =
      typeof msg.isOwn === 'function'
        ? msg.isOwn(currentUserId)
        : Boolean(currentUserId && msg.senderId === currentUserId);
    rowEl.classList.add(isOwn ? 'own' : 'incoming');
    rowEl.dataset.messageId = msg.id || '';

    clone.querySelector('.message-sender').textContent = msg.senderName || 'User';
    clone.querySelector('.message-text').textContent = msg.text;
    clone.querySelector('.message-time').textContent = formatTime(msg.createdAt);

    if (isOwn && msg.id) {
      const deleteBtnEl = clone.querySelector('.message-delete-btn');
      if (deleteBtnEl) {
        deleteBtnEl.hidden = false;
        deleteBtnEl.addEventListener('click', () => this._handleDeleteMessage(msg.id));
      }
      this._applyMessageReadStatus(clone.querySelector('.message-status'), msg);
    }

    return clone;
  }

  /**
   * Incrementally appends new messages, updates read statuses in-place, or re-renders when list changes.
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

    const isSameMessageList =
      this._renderedChatId === activeChatId &&
      this._renderedMessageIds.length === messages.length &&
      this._renderedMessageIds.every((id, idx) => messages[idx]?.id === id);

    if (isSameMessageList) {
      const rowsById = new Map();
      for (const rowEl of this.messageListEl.querySelectorAll('.message-row')) {
        if (rowEl.dataset.messageId) {
          rowsById.set(rowEl.dataset.messageId, rowEl);
        }
      }

      for (const msg of messages) {
        const isOwn =
          typeof msg.isOwn === 'function'
            ? msg.isOwn(currentUserId)
            : Boolean(currentUserId && msg.senderId === currentUserId);
        if (isOwn && msg.id) {
          const rowEl = rowsById.get(msg.id);
          const statusEl = rowEl ? rowEl.querySelector('.message-status') : null;
          this._applyMessageReadStatus(statusEl, msg);
        }
      }

      this._notifyMessagesRead();
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
    this._notifyMessagesRead();
  }

  /**
   * Emits message:read when the visible active chat contains unread incoming messages.
   */
  _notifyMessagesRead() {
    const { activeChatId, messages, currentUser } = this.store.state;
    if (!activeChatId || !currentUser?.id || !Array.isArray(messages) || messages.length === 0) {
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    const currentUserId = String(currentUser.id);
    const unreadIncoming = messages.filter((msg) => {
      const isOwn =
        typeof msg.isOwn === 'function'
          ? msg.isOwn(currentUserId)
          : String(msg.senderId) === currentUserId;
      if (isOwn) {
        return false;
      }
      const alreadyRead =
        typeof msg.isViewedBy === 'function'
          ? msg.isViewedBy(currentUserId)
          : Array.isArray(msg.readBy) && msg.readBy.includes(currentUserId);
      return !alreadyRead;
    });

    if (unreadIncoming.length === 0) {
      return;
    }

    const latestUnread = unreadIncoming[unreadIncoming.length - 1];
    if (!latestUnread?.id || this._lastReadSentForMessageId === latestUnread.id) {
      return;
    }

    const sent = this.socketClient.send(
      'message:read',
      new MarkReadEventDto({ chatId: activeChatId, upToMessageId: latestUnread.id })
    );
    if (sent) {
      this._lastReadSentForMessageId = latestUnread.id;
    }
  }

  /**
   * Deletes the currently active group chat (owner only).
   */
  async _handleDeleteGroup() {
    const activeChatId = this.store.state.activeChatId;
    if (!activeChatId) {
      return;
    }

    this._clearError();
    if (this.deleteGroupBtnEl) {
      this.deleteGroupBtnEl.disabled = true;
    }

    try {
      await this.httpClient.delete(`/chats/${encodeURIComponent(activeChatId)}`);
      const nextChats = this.store.state.chats.filter((c) => c.id !== activeChatId);
      this.store.setState('chats', nextChats);
      if (this.store.state.activeChatId === activeChatId) {
        this.store.setState('activeChatId', null);
      }
    } catch (err) {
      this._showError(err?.message || 'Failed to delete chat.');
    } finally {
      if (this.deleteGroupBtnEl) {
        this.deleteGroupBtnEl.disabled = false;
      }
    }
  }

  /**
   * Deletes one of the current user's own messages from the active chat.
   * @param {string} messageId
   */
  async _handleDeleteMessage(messageId) {
    const activeChatId = this.store.state.activeChatId;
    if (!activeChatId || !messageId) {
      return;
    }

    this._clearError();
    try {
      const result = await this.httpClient.delete(
        `/chats/${encodeURIComponent(activeChatId)}/messages/${encodeURIComponent(messageId)}`
      );
      const nextMessages = this.store.state.messages.filter((m) => m.id !== messageId);
      if (nextMessages.length !== this.store.state.messages.length) {
        this.store.setState('messages', nextMessages);
      }
      if (result && 'lastMessage' in result) {
        const chats = [...this.store.state.chats];
        const idx = chats.findIndex((c) => c.id === activeChatId);
        if (idx !== -1) {
          const chat = chats[idx];
          chats[idx] =
            typeof chat.withLastMessage === 'function'
              ? chat.withLastMessage(result.lastMessage)
              : { ...chat, lastMessage: result.lastMessage };
          this.store.setState('chats', chats);
        }
      }
    } catch (err) {
      this._showError(err?.message || 'Failed to delete message.');
    }
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
