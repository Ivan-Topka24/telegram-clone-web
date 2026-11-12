/**
 * HTTP controller for user search and directory endpoints.
 */
class UserController {
  /**
   * @param {object} deps
   * @param {import('../../../application/services/UserService')} deps.userService
   */
  constructor({ userService }) {
    this.userService = userService;
  }

  /**
   * GET /api/users/search?q=
   */
  async searchUsers(req, res) {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const users = await this.userService.searchUsers(query, req.user.id);
    res.status(200).json({ success: true, data: users });
  }
}

module.exports = UserController;
