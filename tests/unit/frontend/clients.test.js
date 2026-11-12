const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

async function loadEsmClass(relativePath, className) {
  const fullPath = path.resolve(__dirname, relativePath);
  try {
    const mod = await import(pathToFileURL(fullPath).href);
    return mod[className];
  } catch (_err) {
    const source = fs
      .readFileSync(fullPath, 'utf8')
      .replace(new RegExp(`\\bexport\\s+class\\s+${className}\\b`), `class ${className}`);
    return vm.runInThisContext(`(() => { 'use strict'; ${source}; return ${className}; })()`);
  }
}

describe('Frontend Core — HttpClient, SocketClient & Store immutability', () => {
  let Store;
  let HttpClient;
  let SocketClient;

  beforeAll(async () => {
    Store = await loadEsmClass('../../../frontend/js/core/Store.js', 'Store');
    HttpClient = await loadEsmClass('../../../frontend/js/core/HttpClient.js', 'HttpClient');
    SocketClient = await loadEsmClass('../../../frontend/js/core/SocketClient.js', 'SocketClient');
  });

  test('Store.state returns a frozen shallow snapshot preventing direct mutation', () => {
    const store = new Store();
    expect(Object.isFrozen(store.state)).toBe(true);
    expect(() => {
      'use strict';
      store.state.activeChatId = 'tampered';
    }).toThrow(TypeError);
    expect(store.state.activeChatId).toBeNull();
  });

  test('HttpClient injects Bearer token and triggers onUnauthorized on 401 without browser globals', async () => {
    const memoryStorage = new Map([['accessToken', 'jwt-123']]);
    const tokenStorage = {
      getItem: (k) => memoryStorage.get(k) || null,
      setItem: (k, v) => memoryStorage.set(k, v),
      removeItem: (k) => memoryStorage.delete(k),
    };
    const onUnauthorized = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
    });

    const client = new HttpClient('/api', { tokenStorage, onUnauthorized, fetchImpl });
    await expect(client.get('/chats')).rejects.toThrow('Expired');

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/chats',
      expect.objectContaining({ method: 'GET' })
    );
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(client.getToken()).toBeNull();
  });

  test('SocketClient surfaces server error frames and triggers unknown chat callback', () => {
    const store = new Store();
    const onError = jest.fn();
    const onUnknownChatMessage = jest.fn();
    const socketClient = new SocketClient(store, {
      onError,
      onUnknownChatMessage,
      eventTarget: null,
    });

    socketClient._handleMessage(
      JSON.stringify({
        event: 'error',
        payload: { code: 'MESSAGE_TOO_LONG', message: 'Too long' },
      })
    );
    expect(onError).toHaveBeenCalledWith({ code: 'MESSAGE_TOO_LONG', message: 'Too long' });

    socketClient._handleMessage(
      JSON.stringify({
        event: 'message:new',
        payload: { id: 'm1', chatId: 'unknown-chat', senderId: 'u2', text: 'Hello' },
      })
    );
    expect(onUnknownChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'unknown-chat' })
    );
  });
});
