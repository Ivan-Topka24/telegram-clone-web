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
    testContainer = createContainer();
    await testDb.connect();
    server = http.createServer(testContainer.app);
    testContainer.wsGatewayController.initialize(server);

    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;
  });

  afterEach(async () => {
    await testDb.clearDatabase();
  });

  afterAll(async () => {
    if (testContainer) {
      await testContainer.wsGatewayController.close();
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
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

  test('broadcasts message:read receipts, message:deleted, and chat:deleted across connected users', async () => {
    const regA = await request(testContainer.app).post('/api/auth/register').send({
      username: 'owner_ws',
      displayName: 'Owner WS',
      password: 'password123',
    });
    const regB = await request(testContainer.app).post('/api/auth/register').send({
      username: 'member_ws',
      displayName: 'Member WS',
      password: 'password123',
    });

    const userA = regA.body.data;
    const userB = regB.body.data;

    const groupRes = await request(testContainer.app)
      .post('/api/chats/group')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'WS Group', memberIds: [userB.user.id] });
    const groupId = groupRes.body.data.id;

    const wsA = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${userA.token}`);
    const wsB = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${userB.token}`);

    await Promise.all([
      new Promise((resolve) => wsA.on('open', resolve)),
      new Promise((resolve) => wsB.on('open', resolve)),
    ]);

    // 1. UserA sends a message -> readBy starts empty
    const msgPromiseA = waitForSocketMessage(wsA, (m) => m.event === 'message:new');
    const msgPromiseB = waitForSocketMessage(wsB, (m) => m.event === 'message:new');
    wsA.send(
      JSON.stringify({
        event: 'message:send',
        payload: { chatId: groupId, text: 'Check read receipt' },
      })
    );
    const [msgFrameA, msgFrameB] = await Promise.all([msgPromiseA, msgPromiseB]);
    expect(msgFrameA.payload.readBy).toEqual([]);
    const messageId = msgFrameB.payload.id;

    // 2. UserB marks message as read -> UserA and UserB receive message:read & DB readBy updates
    const readPromiseA = waitForSocketMessage(wsA, (m) => m.event === 'message:read');
    const readPromiseB = waitForSocketMessage(wsB, (m) => m.event === 'message:read');
    wsB.send(
      JSON.stringify({
        event: 'message:read',
        payload: { chatId: groupId, upToMessageId: messageId },
      })
    );
    const [readFrameA, readFrameB] = await Promise.all([readPromiseA, readPromiseB]);
    expect(readFrameA.payload).toEqual({
      chatId: groupId,
      readerId: userB.user.id,
      messageIds: [messageId],
    });
    expect(readFrameB.payload.messageIds).toEqual([messageId]);

    const dbMsg = await MessageModel.findById(messageId).exec();
    expect(dbMsg.readBy.map(String)).toEqual([userB.user.id]);

    // 3. UserA deletes the message via WS -> both receive message:deleted
    const deletedMsgPromiseA = waitForSocketMessage(wsA, (m) => m.event === 'message:deleted');
    const deletedMsgPromiseB = waitForSocketMessage(wsB, (m) => m.event === 'message:deleted');
    wsA.send(
      JSON.stringify({
        event: 'message:delete',
        payload: { chatId: groupId, messageId },
      })
    );
    const [delFrameA, delFrameB] = await Promise.all([deletedMsgPromiseA, deletedMsgPromiseB]);
    expect(delFrameA.payload).toEqual({
      chatId: groupId,
      messageId,
      lastMessage: null,
    });
    expect(delFrameB.payload.messageId).toBe(messageId);
    expect(await MessageModel.findById(messageId).exec()).toBeNull();

    // 4. UserA deletes the group via HTTP -> both receive chat:deleted
    const deletedChatPromiseA = waitForSocketMessage(wsA, (m) => m.event === 'chat:deleted');
    const deletedChatPromiseB = waitForSocketMessage(wsB, (m) => m.event === 'chat:deleted');
    const deleteRes = await request(testContainer.app)
      .delete(`/api/chats/${groupId}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(deleteRes.status).toBe(200);

    const [chatDelA, chatDelB] = await Promise.all([deletedChatPromiseA, deletedChatPromiseB]);
    expect(chatDelA.payload).toEqual({ chatId: groupId });
    expect(chatDelB.payload).toEqual({ chatId: groupId });
    expect(await ChatModel.findById(groupId).exec()).toBeNull();

    const closeA = new Promise((r) => wsA.once('close', r));
    const closeB = new Promise((r) => wsB.once('close', r));
    wsA.close();
    wsB.close();
    await Promise.all([closeA, closeB]);
  });
});
