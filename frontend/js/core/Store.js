/**
 * Central client-side state store implementing the Observer pattern.
 */
export class Store {
  constructor() {
    this._state = {
      currentUser: null,
      chats: [],
      activeChatId: null,
      messages: [],
      searchResults: [],
      typingUsers: {},
    };

    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Read-only shallow snapshot of current state properties.
   * @returns {Readonly<object>}
   */
  get state() {
    return Object.freeze({ ...this._state });
  }

  /**
   * Returns a shallow copy of the current application state.
   * @returns {object}
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Updates a top-level state key and notifies subscribed listeners.
   * @param {string} key
   * @param {any} value
   */
  setState(key, value) {
    this._state[key] = value;

    const callbacks = this._listeners.get(key);
    if (!callbacks) {
      return;
    }

    const snapshot = this.state;
    for (const callback of callbacks) {
      callback(value, snapshot);
    }
  }

  /**
   * Subscribes to changes on a specific state key.
   * @param {string} key
   * @param {(value: any, state: object) => void} callback
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }

    const callbacks = this._listeners.get(key);
    callbacks.add(callback);

    return () => {
      callbacks.delete(callback);
    };
  }

  /**
   * Resets all user-scoped session state back to defaults.
   */
  reset() {
    this.setState('currentUser', null);
    this.setState('chats', []);
    this.setState('activeChatId', null);
    this.setState('messages', []);
    this.setState('searchResults', []);
    this.setState('typingUsers', {});
  }
}
