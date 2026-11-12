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
   * GET /api/users/search?q=&limit=
   */
  async searchUsers(req, res) {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = req.query.limit;
    const users = await this.userService.searchUsers(query, req.user.id, limit);
    res.status(200).json({ success: true, data: users });
  }
}

module.exports = UserController;
