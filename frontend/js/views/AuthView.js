import { AuthResultDto, LoginRequestDto, RegisterRequestDto } from '../dtos/AuthDto.js';

/**
 * Manages Login / Register tab switching, credential submission, and auth overlay visibility.
 */
export class AuthView {
  /**
   * @param {object} deps
   * @param {import('../core/Store.js').Store} deps.store
   * @param {import('../core/HttpClient.js').HttpClient} deps.httpClient
   * @param {(token: string) => Promise<void>|void} deps.onAuthenticated
   */
  constructor({ store, httpClient, onAuthenticated }) {
    this.store = store;
    this.httpClient = httpClient;
    this.onAuthenticated = onAuthenticated;
    this.mode = 'login';

    this.overlayEl = document.getElementById('auth-overlay');
    this.appShellEl = document.getElementById('app-shell');
    this.loginTabEl = document.getElementById('auth-tab-login');
    this.registerTabEl = document.getElementById('auth-tab-register');
    this.formEl = document.getElementById('auth-form');
    this.usernameInputEl = document.getElementById('auth-username');
    this.displayNameGroupEl = document.getElementById('auth-display-name-group');
    this.displayNameInputEl = document.getElementById('auth-display-name');
    this.passwordInputEl = document.getElementById('auth-password');
    this.errorEl = document.getElementById('auth-error');
    this.submitBtnEl = document.getElementById('auth-submit-btn');

    this._bindEvents();
  }

  _bindEvents() {
    this.loginTabEl.addEventListener('click', () => this._setMode('login'));
    this.registerTabEl.addEventListener('click', () => this._setMode('register'));
    this.formEl.addEventListener('submit', (event) => this._handleSubmit(event));
  }

  /**
   * Switches between login and registration modes.
   * @param {'login'|'register'} mode
   */
  _setMode(mode) {
    this.mode = mode;
    const isRegister = mode === 'register';

    this.loginTabEl.classList.toggle('active', !isRegister);
    this.loginTabEl.setAttribute('aria-selected', String(!isRegister));
    this.registerTabEl.classList.toggle('active', isRegister);
    this.registerTabEl.setAttribute('aria-selected', String(isRegister));

    this.displayNameGroupEl.hidden = !isRegister;
    this.displayNameInputEl.required = isRegister;
    this.passwordInputEl.setAttribute(
      'autocomplete',
      isRegister ? 'new-password' : 'current-password'
    );
    this.submitBtnEl.textContent = isRegister ? 'Create Account' : 'Sign In';
    this._clearError();
  }

  /**
   * Shows the auth overlay and hides the main messenger shell.
   */
  show() {
    this.formEl.reset();
    this._setMode('login');
    this.appShellEl.hidden = true;
    this.overlayEl.hidden = false;
    this.usernameInputEl.focus();
  }

  /**
   * Hides the auth overlay and reveals the main messenger shell.
   */
  hide() {
    this.overlayEl.hidden = true;
    this.appShellEl.hidden = false;
  }

  _showError(message) {
    this.errorEl.textContent = message;
    this.errorEl.hidden = false;
  }

  _clearError() {
    this.errorEl.textContent = '';
    this.errorEl.hidden = true;
  }

  /**
   * Submits login or registration credentials to the backend API.
   * @param {SubmitEvent} event
   */
  async _handleSubmit(event) {
    event.preventDefault();
    this._clearError();

    const username = this.usernameInputEl.value.trim();
    const displayName = this.displayNameInputEl.value.trim();
    const password = this.passwordInputEl.value;

    if (!username || !password || (this.mode === 'register' && !displayName)) {
      this._showError('Please fill in all required fields.');
      return;
    }

    const endpoint = this.mode === 'register' ? '/auth/register' : '/auth/login';
    const requestDto =
      this.mode === 'register'
        ? new RegisterRequestDto({ username, displayName, password })
        : new LoginRequestDto({ username, password });

    this.submitBtnEl.disabled = true;

    try {
      const rawResult = await this.httpClient.post(endpoint, requestDto);
      const authDto = AuthResultDto.fromPayload(rawResult);
      this.httpClient.setToken(authDto.token);
      this.store.setState('currentUser', authDto.user.toModel());
      this.hide();
      await this.onAuthenticated(authDto.token);
    } catch (err) {
      this._showError(err.message || 'Authentication failed.');
    } finally {
      this.submitBtnEl.disabled = false;
    }
  }
}
