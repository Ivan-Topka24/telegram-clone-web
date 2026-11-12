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
});
