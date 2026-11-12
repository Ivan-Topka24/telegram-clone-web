import { Store } from './core/Store.js';
import { HttpClient } from './core/HttpClient.js';
import { SocketClient } from './core/SocketClient.js';
import { UserDto } from './dtos/UserDto.js';
import { ChatDto } from './dtos/ChatDto.js';
import { AuthView } from './views/AuthView.js';
import { SidebarView } from './views/SidebarView.js';
import { ChatView } from './views/ChatView.js';
import { GroupModalView } from './views/GroupModalView.js';

const store = new Store();
const httpClient = new HttpClient('/api');
const socketClient = new SocketClient(store, {
  onUnknownChatMessage: () => refreshChats(),
});

let authView;
let refreshingChatsPromise = null;

/**
 * Fetches the latest conversation list and updates Store state.
 * @returns {Promise<void>}
 */
async function refreshChats() {
  if (refreshingChatsPromise) {
    return refreshingChatsPromise;
  }

  refreshingChatsPromise = httpClient
    .get('/chats')
    .then((rawChats) => {
      const chatModels = Array.isArray(rawChats)
        ? rawChats.map((raw) => ChatDto.fromPayload(raw).toModel())
        : [];
      store.setState('chats', chatModels);
    })
    .finally(() => {
      refreshingChatsPromise = null;
    });

  return refreshingChatsPromise;
}

/**
 * Loads initial chat list first, then connects the authenticated WebSocket session.
 * @param {string} token
 */
async function initializeSession(token) {
  await refreshChats();
  socketClient.connect(token);
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
  const token = httpClient.getToken();
  if (!token) {
    authView.show();
    return;
  }

  try {
    const rawUser = await httpClient.get('/auth/me');
    store.setState('currentUser', UserDto.fromPayload(rawUser).toModel());
    authView.hide();
    await initializeSession(token);
  } catch (_err) {
    handleLogout();
  }
}

bootstrap();
