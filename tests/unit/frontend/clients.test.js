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

describe('Frontend Core — Models, DTOs, HttpClient, SocketClient & Store', () => {
  let Store;
  let HttpClient;
  let SocketClient;
  let AuthResultDto;
  let UserModel;
  let ChatModel;
  let MessageModel;
  let TypingIndicatorDto;

  beforeAll(() => {
    ({ Store } = loadEsmSync(path.resolve(__dirname, '../../../frontend/js/core/Store.js')));
    ({ HttpClient } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/core/HttpClient.js')
    ));
    ({ SocketClient } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/core/SocketClient.js')
    ));
    ({ AuthResultDto } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/models/AuthDto.js')
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
    ({ TypingIndicatorDto } = loadEsmSync(
      path.resolve(__dirname, '../../../frontend/js/models/TypingIndicatorDto.js')
    ));
  });

  test('Frontend models and DTOs parse incoming API payloads via static fromPayload()', () => {
    const authResult = AuthResultDto.fromPayload({
      token: 'jwt-abc',
      user: { id: 'u1', username: 'alice', displayName: 'Alice Smith' },
    });
    expect(authResult).toBeInstanceOf(AuthResultDto);
    expect(authResult.user).toBeInstanceOf(UserModel);
    expect(authResult.user.getInitials()).toBe('AS');
    expect(authResult.user.getHandle()).toBe('@alice');

    const chatModel = ChatModel.fromPayload({
      id: 'c1',
      type: 'direct',
      displayTitle: 'Alice Smith',
      peer: { id: 'u1', username: 'alice', displayName: 'Alice Smith' },
    });
    expect(chatModel).toBeInstanceOf(ChatModel);
    expect(chatModel.peer).toBeInstanceOf(UserModel);
    expect(chatModel.getPreviewText()).toBe('No messages yet');

    const msgModel = MessageModel.fromPayload({
      id: 'm1',
      chatId: 'c1',
      senderId: 'u1',
      senderName: 'Alice Smith',
      text: 'Hello!',
    });
    expect(msgModel).toBeInstanceOf(MessageModel);
    expect(msgModel.isOwn('u1')).toBe(true);

    const typingDto = TypingIndicatorDto.fromPayload({
      chatId: 'c1',
      userId: 'u1',
      username: 'alice',
    });
    expect(typingDto).toBeInstanceOf(TypingIndicatorDto);
    expect(typingDto.username).toBe('alice');
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

  test('HttpClient.delete(), MessageModel read receipts, ChatModel.isOwner(), and SocketClient deletion/read events', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { chatId: 'g1' } }),
    });
    const client = new HttpClient('/api', {
      tokenStorage: { getItem: () => 'jwt-1', setItem: () => {}, removeItem: () => {} },
      onUnauthorized: () => {},
      fetchImpl,
    });
    const deleteRes = await client.delete('/chats/g1');
    expect(deleteRes).toEqual({ chatId: 'g1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/chats/g1',
      expect.objectContaining({ method: 'DELETE' })
    );

    const groupChat = ChatModel.fromPayload({
      id: 'g1',
      type: 'group',
      title: 'Team',
      members: [
        { userId: 'u1', role: 'owner' },
        { userId: 'u2', role: 'member' },
      ],
    });
    expect(groupChat.isOwner('u1')).toBe(true);
    expect(groupChat.isOwner('u2')).toBe(false);
    expect(groupChat.canDelete('u1')).toBe(true);
    expect(groupChat.canDelete('u2')).toBe(false);

    const directChat = ChatModel.fromPayload({
      id: 'd1',
      type: 'direct',
      displayTitle: 'Bob',
      members: [
        { userId: 'u1', role: 'member' },
        { userId: 'u2', role: 'member' },
      ],
    });
    expect(directChat.canDelete('u1')).toBe(true);
    expect(directChat.canDelete('u2')).toBe(true);
    expect(directChat.canDelete('u3')).toBe(false);

    const ownMsg = MessageModel.fromPayload({
      id: 'm1',
      chatId: 'g1',
      senderId: 'u1',
      text: 'Status check',
      readBy: [],
    });
    expect(ownMsg.isViewed()).toBe(false);
    expect(ownMsg.withReader('u2').isViewed()).toBe(true);
    expect(ownMsg.withReader('u2').isViewedBy('u2')).toBe(true);

    const store = new Store();
    store.setState('chats', [groupChat]);
    store.setState('activeChatId', 'g1');
    store.setState('messages', [ownMsg]);

    const socketClient = new SocketClient(store, { eventTarget: null });

    socketClient._handleMessage(
      JSON.stringify({
        event: 'message:read',
        payload: { chatId: 'g1', readerId: 'u2', messageIds: ['m1'] },
      })
    );
    expect(store.state.messages[0].isViewed()).toBe(true);

    socketClient._handleMessage(
      JSON.stringify({
        event: 'message:deleted',
        payload: { chatId: 'g1', messageId: 'm1', lastMessage: null },
      })
    );
    expect(store.state.messages).toHaveLength(0);
    expect(store.state.chats[0].lastMessage).toBeNull();

    socketClient._handleMessage(
      JSON.stringify({
        event: 'chat:deleted',
        payload: { chatId: 'g1' },
      })
    );
    expect(store.state.chats).toHaveLength(0);
    expect(store.state.activeChatId).toBeNull();
  });
});
