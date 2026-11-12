const TOKEN_STORAGE_KEY = 'accessToken';

/**
 * HTTP client wrapper around fetch('/api/...') with JWT injection and 401 handling.
 */
export class HttpClient {
  /**
   * @param {string} [baseUrl='/api']
   */
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * Retrieves the persisted JWT token from localStorage.
   * @returns {string|null}
   */
  getToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  /**
   * Persists the JWT token in localStorage.
   * @param {string} token
   */
  setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  }

  /**
   * Clears the stored JWT token from localStorage.
   */
  clearToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
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

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
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
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
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
}
