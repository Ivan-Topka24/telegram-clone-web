import { ChatDto, CreateGroupChatRequestDto } from '../dtos/ChatDto.js';
import {
  UserSearchController,
  renderUserSearchList,
} from '../core/UserSearchController.js';

/**
 * Manages the Create Group modal dialog, member multi-selection, and group creation.
 */
export class GroupModalView {
  /**
   * @param {object} deps
   * @param {import('../core/Store.js').Store} deps.store
   * @param {import('../core/HttpClient.js').HttpClient} deps.httpClient
   */
  constructor({ store, httpClient }) {
    this.store = store;
    this.httpClient = httpClient;
    this._selectedMembers = new Map();

    this.openBtnEl = document.getElementById('new-group-btn');
    this.modalEl = document.getElementById('group-modal');
    this.closeBtnEl = document.getElementById('group-close-btn');
    this.cancelBtnEl = document.getElementById('group-cancel-btn');
    this.formEl = document.getElementById('group-modal-form');
    this.titleInputEl = document.getElementById('group-title-input');
    this.memberSearchEl = document.getElementById('group-member-search');
    this.selectedMembersEl = document.getElementById('group-selected-members');
    this.userResultsEl = document.getElementById('group-user-results');
    this.errorEl = document.getElementById('group-modal-error');
    this.submitBtnEl = document.getElementById('group-submit-btn');
    this.searchUserTemplate = document.getElementById('search-user-template');

    this._searchController = new UserSearchController({
      httpClient,
      onResults: (users) => this._renderSearchResults(users),
      onClear: () => this.userResultsEl.replaceChildren(),
      onError: () => this.userResultsEl.replaceChildren(),
    });

    this._bindEvents();
  }

  _bindEvents() {
    this.openBtnEl.addEventListener('click', () => this.open());
    this.closeBtnEl.addEventListener('click', () => this.close());
    this.cancelBtnEl.addEventListener('click', () => this.close());

    this.modalEl.addEventListener('close', () => {
      this.modalEl.returnValue = '';
      this._resetState();
    });

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (event) => {
        const rect = this.modalEl.getBoundingClientRect();
        return (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        );
      };

      this.modalEl.addEventListener('pointerdown', (event) => {
        pressedOutside = isOutside(event);
      });
      this.modalEl.addEventListener('pointerup', (event) => {
        if (pressedOutside && isOutside(event)) {
          this.close();
        }
      });
    }

    this.memberSearchEl.addEventListener('input', () => {
      this._searchController.handleInput(this.memberSearchEl.value);
    });
    this.formEl.addEventListener('submit', (event) => this._handleSubmit(event));
  }

  /**
   * Opens the native modal dialog and focuses the group title field.
   */
  open() {
    this._resetState();
    this.modalEl.showModal();
    this.titleInputEl.focus();
  }

  /**
   * Closes the native modal dialog.
   */
  close() {
    if (this.modalEl.open) {
      this.modalEl.close();
    }
  }

  _resetState() {
    this._searchController.cancel();
    this._selectedMembers.clear();
    this.formEl.reset();
    this.selectedMembersEl.replaceChildren();
    this.userResultsEl.replaceChildren();
    this._clearError();
  }

  _showError(message) {
    this.errorEl.textContent = message;
    this.errorEl.hidden = false;
  }

  _clearError() {
    this.errorEl.textContent = '';
    this.errorEl.hidden = true;
  }

  _renderSearchResults(users) {
    const available = users.filter((u) => !this._selectedMembers.has(u.id));
    renderUserSearchList({
      containerEl: this.userResultsEl,
      templateEl: this.searchUserTemplate,
      users: available,
      emptyText: 'No matching users available',
      onSelect: (user) => this._addMember(user),
    });
  }

  _addMember(user) {
    this._selectedMembers.set(user.id, user);
    this._clearError();
    this.memberSearchEl.value = '';
    this.userResultsEl.replaceChildren();
    this._renderSelectedChips();
    this.memberSearchEl.focus();
  }

  _removeMember(userId) {
    this._selectedMembers.delete(userId);
    this._renderSelectedChips();
  }

  _renderSelectedChips() {
    this.selectedMembersEl.replaceChildren();
    const fragment = document.createDocumentFragment();

    for (const user of this._selectedMembers.values()) {
      const chipEl = document.createElement('span');
      chipEl.className = 'member-chip';

      const nameEl = document.createElement('span');
      nameEl.textContent = user.displayName;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'member-chip-remove';
      removeBtn.setAttribute('aria-label', `Remove ${user.displayName}`);
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', () => this._removeMember(user.id));

      chipEl.append(nameEl, removeBtn);
      fragment.appendChild(chipEl);
    }

    this.selectedMembersEl.appendChild(fragment);
  }

  async _handleSubmit(event) {
    event.preventDefault();
    this._clearError();

    const title = this.titleInputEl.value.trim();
    const memberIds = [...this._selectedMembers.keys()];

    if (!title) {
      this._showError('Group name is required.');
      this.titleInputEl.focus();
      return;
    }

    if (memberIds.length === 0) {
      this._showError('Select at least one member to create a group.');
      this.memberSearchEl.focus();
      return;
    }

    this.submitBtnEl.disabled = true;

    try {
      const requestDto = new CreateGroupChatRequestDto({ title, memberIds });
      const rawChat = await this.httpClient.post('/chats/group', requestDto);
      const chat = ChatDto.fromPayload(rawChat).toModel();
      const chats = [...this.store.state.chats];
      if (!chats.some((existing) => existing.id === chat.id)) {
        chats.unshift(chat);
        this.store.setState('chats', chats);
      }
      this.store.setState('activeChatId', chat.id);
      this.close();
    } catch (err) {
      this._showError(err.message || 'Failed to create group chat.');
    } finally {
      this.submitBtnEl.disabled = false;
    }
  }
}
