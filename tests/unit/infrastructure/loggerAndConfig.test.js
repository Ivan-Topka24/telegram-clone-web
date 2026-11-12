const Logger = require('../../../backend/infrastructure/logging/Logger');
const { loadConfig } = require('../../../backend/config/env');

describe('Infrastructure Layer — Logger & Config', () => {
  test('Logger safely serializes circular objects, BigInt, and Error chains without throwing', () => {
    const logger = new Logger();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const circular = { name: 'node' };
    circular.self = circular;
    const cause = new Error('Root cause');
    const err = new Error('Top failure', { cause });
    err.extra = circular;
    err.big = BigInt(42);

    expect(() => logger.error('Circular test', { err, circular, count: BigInt(10) })).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(parsed.level).toBe('ERROR');
    expect(parsed.meta.circular.self).toBe('[Circular]');
    expect(parsed.meta.count).toBe('10');
    expect(parsed.meta.err.cause.message).toBe('Root cause');

    errorSpy.mockRestore();
  });

  test('loadConfig rejects missing JWT_SECRET in non-test env and weak secrets in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow('JWT_SECRET');
    expect(() =>
      loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'super_secret_jwt_key' })
    ).toThrow('production');
    expect(() =>
      loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short_secret' })
    ).toThrow('32');

    const prod = loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'a_very_strong_random_production_jwt_secret_123456',
      PORT: '8080',
    });
    expect(prod.PORT).toBe(8080);
  });
});
