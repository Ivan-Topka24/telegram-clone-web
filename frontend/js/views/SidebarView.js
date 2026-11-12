import { formatTime, getInitials } from '../core/formatters.js';
import { ChatModel, CreateDirectChatRequestDto } from '../models/ChatModel.js';
import {
  MIN_SEARCH_CHARS,
  UserSearchController,
  renderUserSearchList,
} from '../core/UserSearchController.js';

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

    this.currentUserAvatarEl = document.getElementById('current-user-avatar');
    this.currentUserNameEl = document.getElementById('current-user-name');
    this.currentUserUsernameEl = document.getElementById('current-user-username');
    this.logoutBtnEl = document.getElementById('logout-btn');
    this.searchInputEl = document.getElementById('user-search-input');
    this.searchPanelEl = document.getElementById('search-results-panel');
    this.sidebarErrorEl = document.getElementById('sidebar-error');
    this.searchResultsEl = document.getElementById('search-results');
    this.chatListEl = document.getElementById('chat-list');

    this.chatItemTemplate = document.getElementById('chat-item-template');
    this.searchUserTemplate = document.getElementById('search-user-template');

    this._searchController = new UserSearchController({
      httpClient,
      onResults: (users) => {
        this._clearError();
        this.searchPanelEl.hidden = false;
        this.store.setState('searchResults', users);
      },
      onClear: () => {
        this._clearError();
        this.searchPanelEl.hidden = true;
        this.store.setState('searchResults', []);
      },
      onError: (err) => {
        this.searchPanelEl.hidden = false;
        this.store.setState('searchResults', []);
        this._showError(err?.message || 'Failed to search users.');
      },
    });

    this._bindEvents();
    this._bindSubscriptions();
  }

  _bindEvents() {
    this.logoutBtnEl.addEventListener('click', () => {
      this._searchController.cancel();
      this.onLogout();
    });

    this.searchInputEl.addEventListener('input', () => {
      this._searchController.handleInput(this.searchInputEl.value);
    });
  }

  _bindSubscriptions() {
    this.store.subscribe('currentUser', (user) => this._renderCurrentUser(user));
    this.store.subscribe('searchResults', (users) => this._renderSearchResults(users));
    this.store.subscribe('chats', () => this._renderChatList());
    this.store.subscribe('activeChatId', () => this._renderChatList());
  }

  _showError(message) {
    if (!this.sidebarErrorEl) {
      return;
    }
    this.sidebarErrorEl.textContent = message;
    this.sidebarErrorEl.hidden = false;
  }

  _clearError() {
    if (!this.sidebarErrorEl) {
      return;
    }
    this.sidebarErrorEl.textContent = '';
    this.sidebarErrorEl.hidden = true;
  }

  /**
   * Renders the authenticated user's profile summary in the sidebar header.
   * @param {object|null} user
   */
  _renderCurrentUser(user) {
    if (!user) {
      this._searchController.cancel();
      this.currentUserNameEl.textContent = '';
      this.currentUserUsernameEl.textContent = '';
      this.currentUserAvatarEl.textContent = '?';
      this.searchInputEl.value = '';
      this.searchPanelEl.hidden = true;
      this._clearError();
      return;
    }

    this.currentUserNameEl.textContent = user.displayName;
    this.currentUserUsernameEl.textContent = `@${user.username}`;
    this.currentUserAvatarEl.textContent = getInitials(user.displayName);
  }

  /**
   * Renders global user search results using #search-user-template.
   * @param {Array<object>} users
   */
  _renderSearchResults(users) {
    const trimmed = this.searchInputEl.value.trim();
    if (!trimmed || trimmed.length < MIN_SEARCH_CHARS) {
      this.searchResultsEl.replaceChildren();
      this.searchPanelEl.hidden = true;
      return;
    }

    renderUserSearchList({
      containerEl: this.searchResultsEl,
      templateEl: this.searchUserTemplate,
      users,
      emptyText: 'No users found',
      onSelect: (user) => this._startDirectChat(user.id),
    });
  }

  /**
   * Opens or creates a 1-on-1 chat with the clicked user and clears the search bar.
   * @param {string} targetUserId
   */
  async _startDirectChat(targetUserId) {
    this._clearError();
    try {
      const requestDto = new CreateDirectChatRequestDto({ targetUserId });
      const rawChat = await this.httpClient.post('/chats/direct', requestDto);
      const chat = ChatModel.fromPayload(rawChat);
      this.searchInputEl.value = '';
      this.searchPanelEl.hidden = true;
      this.store.setState('searchResults', []);

      const chats = [...this.store.state.chats];
      if (!chats.some((existing) => existing.id === chat.id)) {
        chats.unshift(chat);
        this.store.setState('chats', chats);
      }

      this.store.setState('activeChatId', chat.id);
    } catch (err) {
      this._showError(err?.message || 'Unable to open direct chat.');
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

    const sortedChats = [...chats].sort(
      (a, b) => b.getActivityTimestamp() - a.getActivityTimestamp()
    );

    const fragment = document.createDocumentFragment();

    for (const chat of sortedChats) {
      const clone = this.chatItemTemplate.content.cloneNode(true);
      const itemEl = clone.querySelector('.chat-item');
      itemEl.dataset.chatId = chat.id;
      if (chat.id === activeChatId) {
        itemEl.classList.add('active');
      }

      const title = chat.getResolvedTitle();
      clone.querySelector('.chat-item-avatar').textContent = getInitials(title);
      clone.querySelector('.chat-item-title').textContent = title;
      clone.querySelector('.chat-item-time').textContent = formatTime(
        chat.lastMessage?.createdAt || chat.updatedAt
      );
      clone.querySelector('.chat-item-preview').textContent = chat.getPreviewText();

      const badgeEl = clone.querySelector('.chat-item-badge');
      if (chat.isGroup()) {
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
