const User = require('../../../backend/domain/models/User');
const AuthService = require('../../../backend/application/services/AuthService');
const {
  ValidationException,
  UnauthorizedException,
  NotFoundException,
} = require('../../../backend/domain/exceptions');

describe('Application Layer — AuthService', () => {
  let userRepository;
  let passwordHasher;
  let jwtProvider;
  let authService;

  beforeEach(() => {
    userRepository = {
      findByUsername: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed_pw'),
      compare: jest.fn(),
    };
    jwtProvider = {
      generateToken: jest.fn().mockReturnValue('signed.jwt.token'),
    };
    authService = new AuthService({ userRepository, passwordHasher, jwtProvider });
  });

  test('register() creates user, hashes password, and returns token + public profile', async () => {
    userRepository.findByUsername.mockResolvedValue(null);
    userRepository.create.mockResolvedValue(
      new User({
        id: 'u1',
        username: 'alice',
        displayName: 'Alice',
        passwordHash: 'hashed_pw',
        createdAt: new Date(),
      })
    );

    const result = await authService.register({
      username: 'Alice',
      displayName: 'Alice',
      password: 'password123',
    });

    expect(userRepository.findByUsername).toHaveBeenCalledWith('alice');
    expect(passwordHasher.hash).toHaveBeenCalledWith('password123');
    expect(result.token).toBe('signed.jwt.token');
    expect(result.user.username).toBe('alice');
    expect(result.user.passwordHash).toBeUndefined();
  });

  test('register() throws ValidationException when username is already taken', async () => {
    userRepository.findByUsername.mockResolvedValue(
      new User({ id: 'u1', username: 'alice', displayName: 'Alice', passwordHash: 'h' })
    );

    await expect(
      authService.register({
        username: 'alice',
        displayName: 'Alice Two',
        password: 'password123',
      })
    ).rejects.toThrow(ValidationException);
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  test('login() verifies credentials and throws UnauthorizedException on mismatch', async () => {
    userRepository.findByUsername.mockResolvedValue(
      new User({ id: 'u1', username: 'alice', displayName: 'Alice', passwordHash: 'hashed_pw' })
    );
    passwordHasher.compare.mockResolvedValue(false);

    await expect(
      authService.login({ username: 'alice', password: 'wrong' })
    ).rejects.toThrow(UnauthorizedException);

    passwordHasher.compare.mockResolvedValue(true);
    const result = await authService.login({ username: 'alice', password: 'password123' });
    expect(result.token).toBe('signed.jwt.token');
    expect(result.user.id).toBe('u1');
  });

  test('getCurrentUser() throws NotFoundException if user does not exist', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(authService.getCurrentUser('missing')).rejects.toThrow(NotFoundException);
  });
});
