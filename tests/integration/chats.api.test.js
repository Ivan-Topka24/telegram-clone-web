const request = require('supertest');
const { createContainer } = require('../../backend/container');
const testDb = require('../setup/testDb');

describe('Integration — /api/chats', () => {
  let app;
  let messageService;

  beforeAll(async () => {
    ({ app, messageService } = createContainer());
    await testDb.connect();
  });

  afterEach(async () => {
    await testDb.clearDatabase();
  });

  afterAll(async () => {
    await testDb.closeDatabase();
  });

  async function registerUser(username, displayName) {
    const res = await request(app).post('/api/auth/register').send({
      username,
      displayName,
      password: 'password123',
    });
    return res.body.data;
  }

  test('creates deduplicated direct chats, creates group chats, and enforces 403 on non-member history', async () => {
    const alice = await registerUser('alice', 'Alice');
    const bob = await registerUser('bob', 'Bob');
    const carol = await registerUser('carol', 'Carol');

    // Concurrent direct chat creation should still return one deduplicated chat
    const [concurrent1, concurrent2] = await Promise.all([
      request(app)
        .post('/api/chats/direct')
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ targetUserId: bob.user.id }),
      request(app)
        .post('/api/chats/direct')
        .set('Authorization', `Bearer ${bob.token}`)
        .send({ targetUserId: alice.user.id }),
    ]);

    expect(concurrent1.status).toBe(200);
    expect(concurrent2.status).toBe(200);
    expect(concurrent2.body.data.id).toBe(concurrent1.body.data.id);
    expect(concurrent1.body.data.displayTitle).toBe('Bob');
    expect(concurrent2.body.data.displayTitle).toBe('Alice');

    const groupRes = await request(app)
      .post('/api/chats/group')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Study Group',
        memberIds: [bob.user.id, carol.user.id],
      });

    expect(groupRes.status).toBe(201);
    expect(groupRes.body.data.type).toBe('group');
    expect(groupRes.body.data.members).toHaveLength(3);

    await messageService.sendMessage({
      senderId: alice.user.id,
      chatId: concurrent1.body.data.id,
      text: 'First message',
    });
    await messageService.sendMessage({
      senderId: bob.user.id,
      chatId: concurrent1.body.data.id,
      text: 'Second message',
    });

    const bobHistory = await request(app)
      .get(`/api/chats/${concurrent1.body.data.id}/messages?limit=1`)
      .set('Authorization', `Bearer ${bob.token}`);

    expect(bobHistory.status).toBe(200);
    expect(bobHistory.body.data).toHaveLength(1);
    expect(bobHistory.body.data[0].text).toBe('Second message');

    const carolForbidden = await request(app)
      .get(`/api/chats/${concurrent1.body.data.id}/messages`)
      .set('Authorization', `Bearer ${carol.token}`);

    expect(carolForbidden.status).toBe(403);
  });

  test('returns 400 on self-chat and 404 on unknown target user or chatId', async () => {
    const alice = await registerUser('alice_neg', 'Alice');

    const selfChatRes = await request(app)
      .post('/api/chats/direct')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ targetUserId: alice.user.id });
    expect(selfChatRes.status).toBe(400);

    const missingUserRes = await request(app)
      .post('/api/chats/direct')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ targetUserId: '507f1f77bcf86cd799439011' });
    expect(missingUserRes.status).toBe(404);

    const missingChatRes = await request(app)
      .get('/api/chats/not-an-object-id/messages')
      .set('Authorization', `Bearer ${alice.token}`);
    expect(missingChatRes.status).toBe(404);
  });

  test('deletes own messages (updating lastMessage) and allows only group owner to delete groups', async () => {
    const alice = await registerUser('alice_del', 'Alice');
    const bob = await registerUser('bob_del', 'Bob');

    const directRes = await request(app)
      .post('/api/chats/direct')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ targetUserId: bob.user.id });
    const directChatId = directRes.body.data.id;

    const m1 = await messageService.sendMessage({
      senderId: alice.user.id,
      chatId: directChatId,
      text: 'First',
    });
    const m2 = await messageService.sendMessage({
      senderId: alice.user.id,
      chatId: directChatId,
      text: 'Second',
    });

    // Bob cannot delete Alice's message
    const forbiddenMsgDel = await request(app)
      .delete(`/api/chats/${directChatId}/messages/${m2.id}`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(forbiddenMsgDel.status).toBe(403);

    // Alice deletes latest message -> lastMessage reverts to First
    const delM2 = await request(app)
      .delete(`/api/chats/${directChatId}/messages/${m2.id}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(delM2.status).toBe(200);
    expect(delM2.body.data.lastMessage.text).toBe('First');

    // Alice deletes remaining message -> lastMessage becomes null
    const delM1 = await request(app)
      .delete(`/api/chats/${directChatId}/messages/${m1.id}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(delM1.status).toBe(200);
    expect(delM1.body.data.lastMessage).toBeNull();

    // Direct chat cannot be deleted via group delete endpoint
    const delDirect = await request(app)
      .delete(`/api/chats/${directChatId}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(delDirect.status).toBe(400);

    // Create group chat and send a message
    const groupRes = await request(app)
      .post('/api/chats/group')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Temp Group', memberIds: [bob.user.id] });
    const groupId = groupRes.body.data.id;

    await messageService.sendMessage({
      senderId: alice.user.id,
      chatId: groupId,
      text: 'Group msg',
    });

    // Non-owner Bob cannot delete group
    const bobDeleteGroup = await request(app)
      .delete(`/api/chats/${groupId}`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(bobDeleteGroup.status).toBe(403);

    // Owner Alice deletes group -> group and messages are gone
    const aliceDeleteGroup = await request(app)
      .delete(`/api/chats/${groupId}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(aliceDeleteGroup.status).toBe(200);
    expect(aliceDeleteGroup.body.data.chatId).toBe(groupId);

    const historyAfterDelete = await request(app)
      .get(`/api/chats/${groupId}/messages`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(historyAfterDelete.status).toBe(404);
  });
});
