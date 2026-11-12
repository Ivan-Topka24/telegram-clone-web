const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

async function loadStoreClass() {
  const storePath = path.resolve(__dirname, '../../../frontend/js/core/Store.js');
  try {
    const mod = await import(pathToFileURL(storePath).href);
    return mod.Store;
  } catch (_err) {
    const source = fs
      .readFileSync(storePath, 'utf8')
      .replace(/\bexport\s+class\s+Store\b/, 'class Store');
    const factory = vm.runInThisContext(`(() => { ${source}; return Store; })()`);
    return factory;
  }
}

describe('Frontend Core — Store (Observer Pattern)', () => {
  let Store;

  beforeAll(async () => {
    Store = await loadStoreClass();
  });

  test('subscribe() and setState() notify listeners with updated value and full state', () => {
    const store = new Store();
    const chatsListener = jest.fn();
    const activeChatListener = jest.fn();

    const unsubscribeChats = store.subscribe('chats', chatsListener);
    store.subscribe('activeChatId', activeChatListener);

    const sampleChats = [{ id: 'c1', displayTitle: 'Alice' }];
    store.setState('chats', sampleChats);

    expect(chatsListener).toHaveBeenCalledTimes(1);
    expect(chatsListener).toHaveBeenCalledWith(sampleChats, store.state);
    expect(activeChatListener).not.toHaveBeenCalled();
    expect(store.getState().chats).toEqual(sampleChats);

    store.setState('activeChatId', 'c1');
    expect(activeChatListener).toHaveBeenCalledWith('c1', store.state);

    // Unsubscribe stops further notifications
    unsubscribeChats();
    store.setState('chats', []);
    expect(chatsListener).toHaveBeenCalledTimes(1);
  });

  test('reset() clears user session state back to defaults', () => {
    const store = new Store();
    store.setState('currentUser', { id: 'u1', username: 'alice' });
    store.setState('activeChatId', 'c1');
    store.setState('messages', [{ id: 'm1', text: 'hi' }]);

    store.reset();

    expect(store.getState()).toEqual({
      currentUser: null,
      chats: [],
      activeChatId: null,
      messages: [],
      searchResults: [],
      typingUsers: {},
    });
  });
});
