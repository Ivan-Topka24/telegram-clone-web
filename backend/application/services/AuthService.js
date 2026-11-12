const {
  ValidationException,
  UnauthorizedException,
  NotFoundException,
} = require('../../domain/exceptions');

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_DISPLAY_NAME_LENGTH = 64;

/**
 * Handles user registration, authentication, and current profile retrieval.
 */
class AuthService {
  /**
   * @param {object} deps
   * @param {import('../../domain/interfaces/IUserRepository')} deps.userRepository
   * @param {{ hash: Function, compare: Function }} deps.passwordHasher
   * @param {{ generateToken: Function }} deps.jwtProvider
   */
  constructor({ userRepository, passwordHasher, jwtProvider }) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.jwtProvider = jwtProvider;
  }

  /**
   * Registers a new user account and issues an authentication JWT.
   * @param {{ username: string, displayName: string, password: string }} input
   * @returns {Promise<{ token: string, user: object }>}
   */
  async register({ username, displayName, password }) {
    const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const trimmedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      throw new ValidationException(
        'Username must be 3-32 characters and contain only letters, numbers, or underscores',
        'INVALID_USERNAME'
      );
    }

    if (!trimmedDisplayName || trimmedDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new ValidationException(
        `Display name must be between 1 and ${MAX_DISPLAY_NAME_LENGTH} characters`,
        'INVALID_DISPLAY_NAME'
      );
    }

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
        'INVALID_PASSWORD'
      );
    }

    const existingUser = await this.userRepository.findByUsername(normalizedUsername);
    if (existingUser) {
      throw new ValidationException('Username is already taken', 'USERNAME_TAKEN');
    }

    const passwordHash = await this.passwordHasher.hash(password);
    const user = await this.userRepository.create({
      username: normalizedUsername,
      displayName: trimmedDisplayName,
      passwordHash,
    });

    const token = this.jwtProvider.generateToken({
      userId: user.id,
      username: user.username,
    });

    return {
      token,
      user: user.toPublicProfile(),
    };
  }

  /**
   * Authenticates an existing user by username and password.
   * @param {{ username: string, password: string }} input
   * @returns {Promise<{ token: string, user: object }>}
   */
  async login({ username, password }) {
    const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';

    if (!normalizedUsername || typeof password !== 'string' || !password) {
      throw new ValidationException('Username and password are required', 'MISSING_CREDENTIALS');
    }

    const user = await this.userRepository.findByUsername(normalizedUsername);
    if (!user) {
      throw new UnauthorizedException('Invalid username or password', 'INVALID_CREDENTIALS');
    }

    const isPasswordValid = await this.passwordHasher.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password', 'INVALID_CREDENTIALS');
    }

    const token = this.jwtProvider.generateToken({
      userId: user.id,
      username: user.username,
    });

    return {
      token,
      user: user.toPublicProfile(),
    };
  }

  /**
   * Retrieves the authenticated user's public profile.
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getCurrentUser(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found', 'USER_NOT_FOUND');
    }

    return user.toPublicProfile();
  }
}

module.exports = AuthService;
