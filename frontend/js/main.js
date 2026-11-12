import { Store } from './core/Store.js';
import { HttpClient } from './core/HttpClient.js';
import { SocketClient } from './core/SocketClient.js';
import { AuthView } from './views/AuthView.js';
import { SidebarView } from './views/SidebarView.js';
import { ChatView } from './views/ChatView.js';
import { GroupModalView } from './views/GroupModalView.js';

const store = new Store();
const httpClient = new HttpClient('/api');
const socketClient = new SocketClient(store);

let authView;

/**
 * Loads initial chat list and connects the authenticated WebSocket session.
 * @param {string} token
 */
async function initializeSession(token) {
  socketClient.connect(token);
  const chats = await httpClient.get('/chats');
  store.setState('chats', Array.isArray(chats) ? chats : []);
}

/**
 * Clears session credentials, closes WebSocket, resets state, and returns to AuthView.
 */
function handleLogout() {
  httpClient.clearToken();
  socketClient.disconnect();
  store.reset();
  authView.show();
}

authView = new AuthView({
  store,
  httpClient,
  onAuthenticated: initializeSession,
});

new SidebarView({
  store,
  httpClient,
  onLogout: handleLogout,
});

new ChatView({
  store,
  httpClient,
  socketClient,
});

new GroupModalView({
  store,
  httpClient,
});

window.addEventListener('auth:unauthorized', () => {
  handleLogout();
});

/**
 * Restores an existing JWT session on startup or falls back to AuthView.
 */
async function bootstrap() {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    authView.show();
    return;
  }

  try {
    const user = await httpClient.get('/auth/me');
    store.setState('currentUser', user);
    authView.hide();
    await initializeSession(token);
  } catch (_err) {
    handleLogout();
  }
}

bootstrap();
