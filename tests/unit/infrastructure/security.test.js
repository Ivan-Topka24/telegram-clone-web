const PasswordHasher = require('../../../backend/infrastructure/security/PasswordHasher');
const JwtProvider = require('../../../backend/infrastructure/security/JwtProvider');
const { UnauthorizedException } = require('../../../backend/domain/exceptions');

describe('Infrastructure Layer — Security', () => {
  test('PasswordHasher hashes and compares passwords accurately', async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash('StrongPass123!');

    expect(hash).toBeDefined();
    expect(hash).not.toBe('StrongPass123!');
    await expect(hasher.compare('StrongPass123!', hash)).resolves.toBe(true);
    await expect(hasher.compare('WrongPass', hash)).resolves.toBe(false);
    await expect(hasher.compare('', hash)).resolves.toBe(false);
  });

  test('JwtProvider generates and verifies tokens and throws UnauthorizedException on invalid tokens', () => {
    const jwtProvider = new JwtProvider({ secret: 'unit_test_secret', expiresIn: '1h' });
    const token = jwtProvider.generateToken({ userId: 'u42', username: 'ivan_dev' });

    const decoded = jwtProvider.verifyToken(token);
    expect(decoded.userId).toBe('u42');
    expect(decoded.username).toBe('ivan_dev');

    const tampered = `${token.slice(0, -3)}xyz`;
    expect(() => jwtProvider.verifyToken(tampered)).toThrow(UnauthorizedException);
    expect(() => jwtProvider.verifyToken('not-a-jwt')).toThrow(UnauthorizedException);
    expect(() => jwtProvider.verifyToken('')).toThrow(UnauthorizedException);
  });

  test('JwtProvider throws UnauthorizedException for expired tokens', () => {
    const jwtProvider = new JwtProvider({ secret: 'unit_test_secret', expiresIn: '0s' });
    const token = jwtProvider.generateToken({ userId: 'u1', username: 'alice' });

    expect(() => jwtProvider.verifyToken(token)).toThrow(UnauthorizedException);
  });
});
