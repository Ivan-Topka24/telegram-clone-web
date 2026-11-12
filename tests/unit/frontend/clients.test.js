const fs = require('fs');
const path = require('path');
const vm = require('vm');

const moduleCache = new Map();

function loadEsmSync(filePath) {
  const resolved = path.resolve(filePath);
  if (moduleCache.has(resolved)) {
    return moduleCache.get(resolved);
  }

  let source = fs.readFileSync(resolved, 'utf8');
  const dir = path.dirname(resolved);
  const deps = {};

  source = source.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*/g,
    (_match, names, relPath) => {
      const depExports = loadEsmSync(path.resolve(dir, relPath));
      const cleanNames = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      const assignments = cleanNames
        .map((name) => {
          deps[name] = depExports[name];
          return `const ${name} = __deps[${JSON.stringify(name)}];`;
        })
        .join('\n');
      return `${assignments}\n`;
    }
  );

  const exportedNames = [];
  source = source.replace(/\bexport\s+(class|function)\s+([A-Za-z0-9_]+)/g, (_m, kind, name) => {
    exportedNames.push(name);
    return `${kind} ${name}`;
  });
  source = source.replace(/\bexport\s+const\s+([A-Za-z0-9_]+)/g, (_m, name) => {
    exportedNames.push(name);
    return `const ${name}`;
  });

  const factory = vm.runInThisContext(
    `(__deps) => { 'use strict'; ${source}; return { ${exportedNames.join(', ')} }; }`
  );
  const exportsObj = factory(deps);
  moduleCache.set(resolved, exportsObj);
  return exportsObj;
}

describe('Frontend Core — DTOs, Models, HttpClient, SocketClient & Store', () => {
  let Store;
  let HttpClient;
  let SocketClient;
  let UserModel;
  let ChatModel;
  let MessageModel;
  let UserDto;
  let ChatDto;
  let MessageDto;

  beforeAll(() => {
    ({ Store } = loadEsmSync(path.resolve(__dirname, '../../../frontend/js/core/Store.js')));
    ({ HttpClient } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/core/HttpClient.js')
    ));
    ({ SocketClient } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/core/SocketClient.js')
    ));
    ({ UserModel } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/models/UserModel.js')
    ));
    ({ ChatModel } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/models/ChatModel.js')
    ));
    ({ MessageModel } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/models/MessageModel.js')
    ));
    ({ UserDto } = loadEsmSync(path.resolve(__dirname, '../../../frontend/js/dtos/UserDto.js')));
    ({ ChatDto } = loadEsmSync(path.resolve(__dirname, '../../../frontend/js/dtos/ChatDto.js')));
    ({ MessageDto } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/dtos/MessageDto.js')
    ));
  });

  test('Frontend DTOs convert incoming wire payloads into client Models', () => {
    const userModel = UserDto.fromPayload({
      id: 'u1',
      username: 'alice',
      displayName: 'Alice Smith',
    }).toModel();
    expect(userModel).toBeInstanceOf(UserModel);
    expect(userModel.getInitials()).toBe('AS');

    const chatModel = ChatDto.fromPayload({
      id: 'c1',
      type: 'direct',
      displayTitle: 'Alice Smith',
      peer: { id: 'u1', username: 'alice', displayName: 'Alice Smith' },
    }).toModel();
    expect(chatModel).toBeInstanceOf(ChatModel);
    expect(chatModel.peer).toBeInstanceOf(UserModel);
    expect(chatModel.getPreviewText()).toBe('No messages yet');

    const msgModel = MessageDto.fromPayload({
      id: 'm1',
      chatId: 'c1',
      senderId: 'u1',
      senderName: 'Alice Smith',
      text: 'Hello!',
    }).toModel();
    expect(msgModel).toBeInstanceOf(MessageModel);
    expect(msgModel.isOwn('u1')).toBe(true);
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

  test('SocketClient converts incoming DTOs to Models, surfaces error frames, and triggers unknown chat callback', () => {
    const store = new Store();
    const initialChat = new ChatModel({ id: 'c1', type: 'direct', displayTitle: 'Bob' });
    store.setState('chats', [initialChat]);
    store.setState('activeChatId', 'c1');

    const onError = jest.fn();
    const onUnknownChatMessage = jest.fn();
    const socketClient = new SocketClient(store, {
      onError,
      onUnknownChatMessage,
      eventTarget: null,
    });

    socketClient._handleMessage(
      JSON.stringify({
        event: 'message:new',
        payload: {
          id: 'm1',
          chatId: 'c1',
          senderId: 'u2',
          senderName: 'Bob',
          text: 'Hi!',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      })
    );
    expect(store.state.messages[0]).toBeInstanceOf(MessageModel);
    expect(store.state.chats[0]).toBeInstanceOf(ChatModel);
    expect(store.state.chats[0].getPreviewText()).toBe('Hi!');

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
        payload: { id: 'm2', chatId: 'unknown-chat', senderId: 'u2', text: 'Hello' },
      })
    );
    expect(onUnknownChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'unknown-chat' })
    );
  });
});
