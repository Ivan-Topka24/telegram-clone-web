const createAuthMiddleware = require('../../../backend/presentation/http/middlewares/authMiddleware');
const createGlobalExceptionMiddleware = require('../../../backend/presentation/http/middlewares/globalExceptionMiddleware');
const createRateLimitMiddleware = require('../../../backend/presentation/http/middlewares/rateLimitMiddleware');
const createSecurityHeadersMiddleware = require('../../../backend/presentation/http/middlewares/securityHeadersMiddleware');
const { UnauthorizedException, ConflictException } = require('../../../backend/domain/exceptions');

function createMockRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    body: null,
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('Presentation Layer — HTTP Middlewares', () => {
  test('authMiddleware accepts case-insensitive Bearer tokens and rejects missing userId claims', () => {
    const jwtProvider = {
      verifyToken: jest.fn(),
    };
    const middleware = createAuthMiddleware(jwtProvider);

    // Valid token with lowercase bearer
    jwtProvider.verifyToken.mockReturnValueOnce({ userId: 'u1', username: 'alice' });
    const req1 = { headers: { authorization: 'bearer valid.jwt.token' } };
    const next1 = jest.fn();
    middleware(req1, createMockRes(), next1);
    expect(req1.user).toEqual({ id: 'u1', username: 'alice' });
    expect(next1).toHaveBeenCalledWith();

    // Missing userId claim
    jwtProvider.verifyToken.mockReturnValueOnce({ username: 'alice' });
    const req2 = { headers: { authorization: 'Bearer valid.jwt.token' } };
    const next2 = jest.fn();
    middleware(req2, createMockRes(), next2);
    expect(next2.mock.calls[0][0]).toBeInstanceOf(UnauthorizedException);
  });

  test('globalExceptionMiddleware maps DomainException (including 409 ConflictException) and hides unexpected 500s', () => {
    const logger = { error: jest.fn() };
    const middleware = createGlobalExceptionMiddleware(logger);

    const res409 = createMockRes();
    middleware(new ConflictException('Already exists', 'USERNAME_TAKEN'), {}, res409, jest.fn());
    expect(res409.statusCode).toBe(409);
    expect(res409.body.error.code).toBe('USERNAME_TAKEN');

    const res500 = createMockRes();
    middleware(new Error('DB crash'), { method: 'GET', originalUrl: '/api/test' }, res500, jest.fn());
    expect(res500.statusCode).toBe(500);
    expect(res500.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  test('rateLimitMiddleware returns 429 with Retry-After once maxRequests is exceeded', () => {
    const limiter = createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 2 });
    const req = { ip: '127.0.0.1' };
    const next = jest.fn();

    limiter(req, createMockRes(), next);
    limiter(req, createMockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    const res429 = createMockRes();
    limiter(req, res429, next);
    expect(res429.statusCode).toBe(429);
    expect(res429.headers['Retry-After']).toBeDefined();
    expect(res429.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  test('securityHeadersMiddleware sets nosniff, X-Frame-Options, and CSP headers', () => {
    const middleware = createSecurityHeadersMiddleware();
    const res = createMockRes();
    const next = jest.fn();

    middleware({}, res, next);
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
