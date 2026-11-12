import { getInitials } from './formatters.js';

export const SEARCH_DEBOUNCE_MS = 300;
export const MIN_SEARCH_CHARS = 2;

/**
 * Shared debounced user-search controller with stale-request cancellation and DOM rendering.
 */
export class UserSearchController {
  /**
   * @param {object} deps
   * @param {import('./HttpClient.js').HttpClient} deps.httpClient
   * @param {(users: Array<object>) => void} deps.onResults
   * @param {() => void} [deps.onClear]
   * @param {(err: Error) => void} [deps.onError]
   */
  constructor({ httpClient, onResults, onClear = () => {}, onError = () => {} }) {
    this.httpClient = httpClient;
    this.onResults = onResults;
    this.onClear = onClear;
    this.onError = onError;
    this._debounceTimer = null;
    this._latestToken = 0;
  }

  /**
   * Cancels any pending debounced search and invalidates in-flight requests.
   */
  cancel() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._latestToken += 1;
  }

  /**
   * Schedules or clears a user search based on query length.
   * @param {string} rawQuery
   */
  handleInput(rawQuery) {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
    if (query.length < MIN_SEARCH_CHARS) {
      this._latestToken += 1;
      this.onClear();
      return;
    }

    this._debounceTimer = setTimeout(() => {
      this._execute(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  /**
   * Executes GET /api/users/search?q=... and discards stale responses.
   * @param {string} query
   */
  async _execute(query) {
    const requestToken = ++this._latestToken;

    try {
      const users = await this.httpClient.get(`/users/search?q=${encodeURIComponent(query)}`);
      if (requestToken !== this._latestToken) {
        return;
      }
      this.onResults(Array.isArray(users) ? users : []);
    } catch (err) {
      if (requestToken === this._latestToken) {
        this.onError(err);
      }
    }
  }
}

/**
 * Renders a list of users into a container using #search-user-template.
 * @param {object} params
 * @param {HTMLElement} params.containerEl
 * @param {HTMLTemplateElement} params.templateEl
 * @param {Array<object>} params.users
 * @param {string} params.emptyText
 * @param {(user: object) => void} params.onSelect
 */
export function renderUserSearchList({ containerEl, templateEl, users, emptyText, onSelect }) {
  containerEl.replaceChildren();

  if (!Array.isArray(users) || users.length === 0) {
    const emptyEl = document.createElement('li');
    emptyEl.className = 'sidebar-empty';
    emptyEl.textContent = emptyText;
    containerEl.appendChild(emptyEl);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const user of users) {
    const clone = templateEl.content.cloneNode(true);
    const itemEl = clone.querySelector('.search-user-item');
    itemEl.dataset.userId = user.id;
    clone.querySelector('.search-user-avatar').textContent = getInitials(user.displayName);
    clone.querySelector('.search-user-name').textContent = user.displayName;
    clone.querySelector('.search-user-handle').textContent = `@${user.username}`;

    itemEl.addEventListener('click', () => onSelect(user));
    fragment.appendChild(clone);
  }

  containerEl.appendChild(fragment);
}
