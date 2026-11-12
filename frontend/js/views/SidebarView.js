import { formatTime, getInitials } from '../core/formatters.js';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_CHARS = 2;

/**
 * Manages the left sidebar: user profile, logout, debounced user search, and chat list.
 */
export class SidebarView {
  /**
   * @param {object} deps
   * @param {import('../core/Store.js').Store} deps.store
   * @param {import('../core/HttpClient.js').HttpClient} deps.httpClient
   * @param {() => void} deps.onLogout
   */
  constructor({ store, httpClient, onLogout }) {
    this.store = store;
    this.httpClient = httpClient;
    this.onLogout = onLogout;
    this._searchDebounceTimer = null;
    this._latestSearchToken = 0;

    this.currentUserAvatarEl = document.getElementById('current-user-avatar');
    this.currentUserNameEl = document.getElementById('current-user-name');
    this.currentUserUsernameEl = document.getElementById('current-user-username');
    this.logoutBtnEl = document.getElementById('logout-btn');
    this.searchInputEl = document.getElementById('user-search-input');
    this.searchPanelEl = document.getElementById('search-results-panel');
    this.searchResultsEl = document.getElementById('search-results');
    this.chatListEl = document.getElementById('chat-list');

    this.chatItemTemplate = document.getElementById('chat-item-template');
    this.searchUserTemplate = document.getElementById('search-user-template');

    this._bindEvents();
    this._bindSubscriptions();
  }

  _bindEvents() {
    this.logoutBtnEl.addEventListener('click', () => {
      this.onLogout();
    });

    this.searchInputEl.addEventListener('input', () => {
      this._handleSearchInput();
    });
  }

  _bindSubscriptions() {
    this.store.subscribe('currentUser', (user) => this._renderCurrentUser(user));
    this.store.subscribe('searchResults', (users) => this._renderSearchResults(users));
    this.store.subscribe('chats', () => this._renderChatList());
    this.store.subscribe('activeChatId', () => this._renderChatList());
  }

  /**
   * Renders the authenticated user's profile summary in the sidebar header.
   * @param {object|null} user
   */
  _renderCurrentUser(user) {
    if (!user) {
      this.currentUserNameEl.textContent = '';
      this.currentUserUsernameEl.textContent = '';
      this.currentUserAvatarEl.textContent = '?';
      this.searchInputEl.value = '';
      this.searchPanelEl.hidden = true;
      return;
    }

    this.currentUserNameEl.textContent = user.displayName;
    this.currentUserUsernameEl.textContent = `@${user.username}`;
    this.currentUserAvatarEl.textContent = getInitials(user.displayName);
  }

  /**
   * Debounces global user search input by 300ms.
   */
  _handleSearchInput() {
    if (this._searchDebounceTimer) {
      clearTimeout(this._searchDebounceTimer);
    }

    const query = this.searchInputEl.value.trim();
    if (query.length < MIN_SEARCH_CHARS) {
      this._latestSearchToken += 1;
      this.searchPanelEl.hidden = true;
      this.store.setState('searchResults', []);
      return;
    }

    this._searchDebounceTimer = setTimeout(() => {
      this._executeSearch(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  /**
   * Queries GET /api/users/search?q=... and updates store.searchResults.
   * @param {string} query
   */
  async _executeSearch(query) {
    const requestToken = ++this._latestSearchToken;

    try {
      const users = await this.httpClient.get(`/users/search?q=${encodeURIComponent(query)}`);
      if (requestToken !== this._latestSearchToken) {
        return;
      }
      this.searchPanelEl.hidden = false;
      this.store.setState('searchResults', Array.isArray(users) ? users : []);
    } catch (_err) {
      if (requestToken === this._latestSearchToken) {
        this.searchPanelEl.hidden = true;
        this.store.setState('searchResults', []);
      }
    }
  }

  /**
   * Renders global user search results using #search-user-template.
   * @param {Array<object>} users
   */
  _renderSearchResults(users) {
    this.searchResultsEl.replaceChildren();

    if (!this.searchInputEl.value.trim() || this.searchInputEl.value.trim().length < MIN_SEARCH_CHARS) {
      this.searchPanelEl.hidden = true;
      return;
    }

    if (!Array.isArray(users) || users.length === 0) {
      const emptyEl = document.createElement('li');
      emptyEl.className = 'sidebar-empty';
      emptyEl.textContent = 'No users found';
      this.searchResultsEl.appendChild(emptyEl);
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const user of users) {
      const clone = this.searchUserTemplate.content.cloneNode(true);
      const itemEl = clone.querySelector('.search-user-item');
      itemEl.dataset.userId = user.id;
      clone.querySelector('.search-user-avatar').textContent = getInitials(user.displayName);
      clone.querySelector('.search-user-name').textContent = user.displayName;
      clone.querySelector('.search-user-handle').textContent = `@${user.username}`;

      itemEl.addEventListener('click', () => this._startDirectChat(user.id));
      fragment.appendChild(clone);
    }

    this.searchResultsEl.appendChild(fragment);
  }

  /**
   * Opens or creates a 1-on-1 chat with the clicked user and clears the search bar.
   * @param {string} targetUserId
   */
  async _startDirectChat(targetUserId) {
    try {
      const chat = await this.httpClient.post('/chats/direct', { targetUserId });
      this.searchInputEl.value = '';
      this.searchPanelEl.hidden = true;
      this.store.setState('searchResults', []);

      const chats = [...this.store.state.chats];
      if (!chats.some((existing) => existing.id === chat.id)) {
        chats.unshift(chat);
        this.store.setState('chats', chats);
      }

      this.store.setState('activeChatId', chat.id);
    } catch (_err) {
      // Handled globally if 401; ignore transient network errors.
    }
  }

  /**
   * Renders the sorted conversation list using #chat-item-template.
   */
  _renderChatList() {
    const { chats, activeChatId } = this.store.state;
    this.chatListEl.replaceChildren();

    if (!Array.isArray(chats) || chats.length === 0) {
      const emptyEl = document.createElement('li');
      emptyEl.className = 'sidebar-empty';
      emptyEl.textContent = 'No conversations yet. Search for a user above!';
      this.chatListEl.appendChild(emptyEl);
      return;
    }

    const sortedChats = [...chats].sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    const fragment = document.createDocumentFragment();

    for (const chat of sortedChats) {
      const clone = this.chatItemTemplate.content.cloneNode(true);
      const itemEl = clone.querySelector('.chat-item');
      itemEl.dataset.chatId = chat.id;
      if (chat.id === activeChatId) {
        itemEl.classList.add('active');
      }

      const title = chat.displayTitle || chat.title || 'Chat';
      clone.querySelector('.chat-item-avatar').textContent = getInitials(title);
      clone.querySelector('.chat-item-title').textContent = title;
      clone.querySelector('.chat-item-time').textContent = formatTime(
        chat.lastMessage?.createdAt || chat.updatedAt
      );
      clone.querySelector('.chat-item-preview').textContent = chat.lastMessage?.text
        ? chat.lastMessage.text
        : chat.type === 'group'
          ? 'Group created'
          : 'No messages yet';

      const badgeEl = clone.querySelector('.chat-item-badge');
      if (chat.type === 'group') {
        badgeEl.textContent = 'Group';
        badgeEl.hidden = false;
      }

      itemEl.addEventListener('click', () => {
        this.store.setState('activeChatId', chat.id);
      });

      fragment.appendChild(clone);
    }

    this.chatListEl.appendChild(fragment);
  }
}
