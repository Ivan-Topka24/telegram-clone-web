const request = require('supertest');
const container = require('../../backend/container');
const testDb = require('../setup/testDb');

describe('Integration — /api/users/search', () => {
  const { app } = container;

  beforeAll(async () => {
    await testDb.connect();
  });

  afterEach(async () => {
    await testDb.clearDatabase();
  });

  afterAll(async () => {
    await testDb.closeDatabase();
  });

  test('returns matching users by prefix, excludes requester, and strips passwordHash', async () => {
    const ivanDev = await request(app).post('/api/auth/register').send({
      username: 'ivan_dev',
      displayName: 'Ivan Dev',
      password: 'password123',
    });
    await request(app).post('/api/auth/register').send({
      username: 'ivan_test',
      displayName: 'Ivan Test',
      password: 'password123',
    });
    await request(app).post('/api/auth/register').send({
      username: 'polina',
      displayName: 'Polina',
      password: 'password123',
    });

    const token = ivanDev.body.data.token;

    const searchRes = await request(app)
      .get('/api/users/search?q=ivan')
      .set('Authorization', `Bearer ${token}`);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.success).toBe(true);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].username).toBe('ivan_test');
    expect(searchRes.body.data[0].passwordHash).toBeUndefined();

    // Queries shorter than 2 chars return empty array
    const shortRes = await request(app)
      .get('/api/users/search?q=i')
      .set('Authorization', `Bearer ${token}`);

    expect(shortRes.status).toBe(200);
    expect(shortRes.body.data).toEqual([]);
  });
});
