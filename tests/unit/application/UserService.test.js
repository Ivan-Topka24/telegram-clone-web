const User = require('../../../backend/domain/models/User');
const UserService = require('../../../backend/application/services/UserService');

describe('Application Layer — UserService', () => {
  let userRepository;
  let userService;

  beforeEach(() => {
    userRepository = {
      searchByUsernamePrefix: jest.fn(),
    };
    userService = new UserService({ userRepository });
  });

  test('returns empty list for non-string or <2 character queries without hitting repository', async () => {
    await expect(userService.searchUsers(null, 'u1')).resolves.toEqual([]);
    await expect(userService.searchUsers('a', 'u1')).resolves.toEqual([]);
    await expect(userService.searchUsers('  a ', 'u1')).resolves.toEqual([]);
    expect(userRepository.searchByUsernamePrefix).not.toHaveBeenCalled();
  });

  test('clamps limit and maps matching users to public profiles', async () => {
    userRepository.searchByUsernamePrefix.mockResolvedValue([
      new User({ id: 'u2', username: 'alice_dev', displayName: 'Alice', passwordHash: 'secret' }),
    ]);

    const result = await userService.searchUsers('  ali ', 'u1', 500);

    expect(userRepository.searchByUsernamePrefix).toHaveBeenCalledWith('ali', 'u1', 50);
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe('alice_dev');
    expect(result[0].passwordHash).toBeUndefined();
  });
});
