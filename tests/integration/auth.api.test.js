const request = require('supertest');
const { createContainer } = require('../../backend/container');
const testDb = require('../setup/testDb');

describe('Integration — /api/auth', () => {
  let app;

  beforeAll(async () => {
    ({ app } = createContainer());
    await testDb.connect();
  });

  afterEach(async () => {
    await testDb.clearDatabase();
  });

  afterAll(async () => {
    await testDb.closeDatabase();
  });

  test('registers a user (201), rejects duplicate username (400), logs in (200), and verifies /me (200 vs 401)', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'alice_dev',
        displayName: 'Alice Dev',
        password: 'password123',
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.success).toBe(true);
    expect(registerRes.body.data.token).toBeTruthy();
    expect(registerRes.body.data.user.username).toBe('alice_dev');
    expect(registerRes.body.data.user.passwordHash).toBeUndefined();

    const dupRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'alice_dev',
        displayName: 'Alice Clone',
        password: 'password123',
      });

    expect(dupRes.status).toBe(400);
    expect(dupRes.body.success).toBe(false);

    const badLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'alice_dev',
        password: 'wrongpassword',
      });

    expect(badLoginRes.status).toBe(401);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'alice_dev',
        password: 'password123',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeTruthy();

    const unauthMeRes = await request(app).get('/api/auth/me');
    expect(unauthMeRes.status).toBe(401);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.username).toBe('alice_dev');
    expect(meRes.body.data.passwordHash).toBeUndefined();
  });

  test('rejects invalid input and overly long passwords with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'alice_longpw',
        displayName: 'Alice',
        password: 'a'.repeat(73),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
  });
});
