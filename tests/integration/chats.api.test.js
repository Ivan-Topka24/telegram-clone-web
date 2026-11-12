const request = require('supertest');
const container = require('../../backend/container');
const testDb = require('../setup/testDb');

describe('Integration — /api/chats', () => {
  const { app, messageService } = container;

  beforeAll(async () => {
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

    // Create direct chat between Alice and Bob
    const direct1 = await request(app)
      .post('/api/chats/direct')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ targetUserId: bob.user.id });

    expect(direct1.status).toBe(200);
    expect(direct1.body.data.type).toBe('direct');
    expect(direct1.body.data.displayTitle).toBe('Bob');

    // Calling again between the same pair returns the exact same chat ID
    const direct2 = await request(app)
      .post('/api/chats/direct')
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ targetUserId: alice.user.id });

    expect(direct2.status).toBe(200);
    expect(direct2.body.data.id).toBe(direct1.body.data.id);
    expect(direct2.body.data.displayTitle).toBe('Alice');

    // Create group chat with 3 members
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

    // Send a message into the direct chat and verify history + 403 check
    await messageService.sendMessage({
      senderId: alice.user.id,
      chatId: direct1.body.data.id,
      text: 'Hi Bob!',
    });

    const bobHistory = await request(app)
      .get(`/api/chats/${direct1.body.data.id}/messages`)
      .set('Authorization', `Bearer ${bob.token}`);

    expect(bobHistory.status).toBe(200);
    expect(bobHistory.body.data).toHaveLength(1);
    expect(bobHistory.body.data[0].text).toBe('Hi Bob!');
    expect(bobHistory.body.data[0].senderName).toBe('Alice');

    const carolForbidden = await request(app)
      .get(`/api/chats/${direct1.body.data.id}/messages`)
      .set('Authorization', `Bearer ${carol.token}`);

    expect(carolForbidden.status).toBe(403);
  });
});
