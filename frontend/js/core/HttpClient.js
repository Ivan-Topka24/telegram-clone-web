const TOKEN_STORAGE_KEY = 'accessToken';

function getDefaultTokenStorage() {
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function getDefaultUnauthorizedHandler() {
  return () => {
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
  };
}

/**
 * HTTP client wrapper around fetch('/api/...') with JWT injection and 401 handling.
 */
export class HttpClient {
  /**
   * @param {string} [baseUrl='/api']
   * @param {object} [options]
   * @param {{ getItem: Function, setItem: Function, removeItem: Function }} [options.tokenStorage]
   * @param {() => void} [options.onUnauthorized]
   * @param {typeof fetch} [options.fetchImpl]
   */
  constructor(
    baseUrl = '/api',
    {
      tokenStorage = getDefaultTokenStorage(),
      onUnauthorized = getDefaultUnauthorizedHandler(),
      fetchImpl = (...args) => fetch(...args),
    } = {}
  ) {
    this.baseUrl = baseUrl;
    this.tokenStorage = tokenStorage;
    this.onUnauthorized = onUnauthorized;
    this.fetchImpl = fetchImpl;
  }

  /**
   * Retrieves the persisted JWT token.
   * @returns {string|null}
   */
  getToken() {
    return this.tokenStorage.getItem(TOKEN_STORAGE_KEY);
  }

  /**
   * Persists the JWT token.
   * @param {string} token
   */
  setToken(token) {
    if (token) {
      this.tokenStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  }

  /**
   * Clears the stored JWT token.
   */
  clearToken() {
    this.tokenStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  /**
   * Executes an API request, unwraps { success, data, error }, and handles HTTP 401.
   * @param {string} endpoint
   * @param {RequestInit & { body?: any }} [options={}]
   * @returns {Promise<any>}
   */
  async request(endpoint, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = this.getToken();

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    let body = options.body;
    if (body !== undefined && typeof body !== 'string' && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      body,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_err) {
      payload = null;
    }

    if (response.status === 401) {
      this.clearToken();
      this.onUnauthorized();
    }

    if (!response.ok || (payload && payload.success === false)) {
      const errorMessage = payload?.error?.message || `HTTP Error ${response.status}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      error.code = payload?.error?.code || 'HTTP_ERROR';
      throw error;
    }

    return payload ? payload.data : null;
  }

  /**
   * Sends a GET request.
   * @param {string} endpoint
   * @returns {Promise<any>}
   */
  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * Sends a POST request with a JSON body.
   * @param {string} endpoint
   * @param {any} body
   * @returns {Promise<any>}
   */
  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  }

  /**
   * Sends a DELETE request.
   * @param {string} endpoint
   * @returns {Promise<any>}
   */
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}
