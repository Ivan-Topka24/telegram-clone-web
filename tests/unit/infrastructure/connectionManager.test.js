const ConnectionManager = require('../../../backend/infrastructure/realtime/ConnectionManager');
const WsRealtimeNotifier = require('../../../backend/infrastructure/realtime/WsRealtimeNotifier');

describe('Infrastructure Layer — ConnectionManager & WsRealtimeNotifier', () => {
  test('ConnectionManager tracks multiple tabs per user and cleans up on disconnect', () => {
    const manager = new ConnectionManager();
    const tab1 = { readyState: 1, send: jest.fn() };
    const tab2 = { readyState: 1, send: jest.fn() };

    expect(manager.isOnline('u1')).toBe(false);

    manager.addConnection('u1', tab1);
    manager.addConnection('u1', tab2);
    expect(manager.isOnline('u1')).toBe(true);
    expect(manager.getConnections('u1').size).toBe(2);

    manager.removeConnection('u1', tab1);
    expect(manager.isOnline('u1')).toBe(true);
    expect(manager.getConnections('u1').size).toBe(1);

    manager.removeConnection('u1', tab2);
    expect(manager.isOnline('u1')).toBe(false);
    expect(manager.getConnections('u1').size).toBe(0);
  });

  test('WsRealtimeNotifier sends JSON frames only to open sockets and deduplicates userIds', () => {
    const manager = new ConnectionManager();
    const openSocket1 = { readyState: 1, send: jest.fn() };
    const openSocket2 = { readyState: 1, send: jest.fn() };
    const closedSocket = { readyState: 3, send: jest.fn() };

    manager.addConnection('u1', openSocket1);
    manager.addConnection('u1', openSocket2);
    manager.addConnection('u2', closedSocket);

    const notifier = new WsRealtimeNotifier(manager);
    notifier.notifyUsers(['u1', 'u1', 'u2'], 'message:new', { id: 'm1', text: 'Hi' });

    const expectedFrame = JSON.stringify({
      event: 'message:new',
      payload: { id: 'm1', text: 'Hi' },
    });

    expect(openSocket1.send).toHaveBeenCalledTimes(1);
    expect(openSocket1.send).toHaveBeenCalledWith(expectedFrame);
    expect(openSocket2.send).toHaveBeenCalledTimes(1);
    expect(openSocket2.send).toHaveBeenCalledWith(expectedFrame);
    expect(closedSocket.send).not.toHaveBeenCalled();
  });
});
