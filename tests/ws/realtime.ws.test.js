const http = require('http');
const WebSocket = require('ws');
const request = require('supertest');
const { createContainer } = require('../../backend/container');
const ChatModel = require('../../backend/persistence/schemas/ChatSchema');
const MessageModel = require('../../backend/persistence/schemas/MessageSchema');
const testDb = require('../setup/testDb');

function waitForSocketMessage(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, 5000);

    const onMessage = (raw) => {
      const parsed = JSON.parse(raw.toString());
      if (!predicate || predicate(parsed)) {
        cleanup();
        resolve(parsed);
      }
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    function cleanup() {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.off('error', onError);
    }

    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

describe('E2E WebSocket — WsGatewayController', () => {
  let testContainer;
  let server;
  let port;

  beforeAll(async () => {
    await testDb.connect();
    testContainer = createContainer();
    server = http.createServer(testContainer.app);
    testContainer.wsGatewayController.initialize(server);

    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;
  });

  afterEach(async () => {
    await testDb.clearDatabase();
  });

  afterAll(async () => {
    await testContainer.wsGatewayController.close();
    await new Promise((resolve) => server.close(resolve));
    await testDb.closeDatabase();
  });

  test('rejects invalid token with 4001, persists & broadcasts message:send -> message:new, and relays chat:typing', async () => {
    // 1. Reject invalid token handshake
    const invalidWs = new WebSocket(`ws://127.0.0.1:${port}/ws?token=invalid_token`);
    const closeCode = await new Promise((resolve) => {
      invalidWs.on('close', (code) => resolve(code));
    });
    expect(closeCode).toBe(4001);

    // 2. Register UserA & UserB and create direct chat
    const regA = await request(testContainer.app).post('/api/auth/register').send({
      username: 'user_a',
      displayName: 'User A',
      password: 'password123',
    });
    const regB = await request(testContainer.app).post('/api/auth/register').send({
      username: 'user_b',
      displayName: 'User B',
      password: 'password123',
    });

    const userA = regA.body.data;
    const userB = regB.body.data;

    const chatRes = await request(testContainer.app)
      .post('/api/chats/direct')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ targetUserId: userB.user.id });

    const chatId = chatRes.body.data.id;

    // 3. Connect both users over WebSocket
    const wsA = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${userA.token}`);
    const wsB = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${userB.token}`);

    await Promise.all([
      new Promise((resolve) => wsA.on('open', resolve)),
      new Promise((resolve) => wsB.on('open', resolve)),
    ]);

    // 4. Send message:send from UserA -> both UserA and UserB receive message:new
    const msgPromiseA = waitForSocketMessage(wsA, (m) => m.event === 'message:new');
    const msgPromiseB = waitForSocketMessage(wsB, (m) => m.event === 'message:new');

    wsA.send(
      JSON.stringify({
        event: 'message:send',
        payload: { chatId, text: 'Hello via WS!' },
      })
    );

    const [frameA, frameB] = await Promise.all([msgPromiseA, msgPromiseB]);
    expect(frameA.payload.text).toBe('Hello via WS!');
    expect(frameB.payload.text).toBe('Hello via WS!');
    expect(frameB.payload.senderName).toBe('User A');

    // Verify atomic MongoDB persistence
    const savedMessages = await MessageModel.find({ chatId }).exec();
    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0].text).toBe('Hello via WS!');

    const updatedChat = await ChatModel.findById(chatId).exec();
    expect(updatedChat.lastMessage).not.toBeNull();
    expect(updatedChat.lastMessage.text).toBe('Hello via WS!');

    // 5. Send chat:typing from UserA -> UserB receives chat:typing
    const typingPromiseB = waitForSocketMessage(wsB, (m) => m.event === 'chat:typing');
    wsA.send(
      JSON.stringify({
        event: 'chat:typing',
        payload: { chatId },
      })
    );

    const typingFrame = await typingPromiseB;
    expect(typingFrame.payload).toEqual({
      chatId,
      userId: userA.user.id,
      username: 'user_a',
    });

    const closeA = new Promise((r) => wsA.once('close', r));
    const closeB = new Promise((r) => wsB.once('close', r));
    wsA.close();
    wsB.close();
    await Promise.all([closeA, closeB]);
  });
});
