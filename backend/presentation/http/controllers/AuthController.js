/**
 * HTTP controller for authentication endpoints.
 */
class AuthController {
  /**
   * @param {object} deps
   * @param {import('../../../application/services/AuthService')} deps.authService
   */
  constructor({ authService }) {
    this.authService = authService;
  }

  /**
   * POST /api/auth/register
   */
  async register(req, res) {
    const { username, displayName, password } = req.body || {};
    const result = await this.authService.register({ username, displayName, password });
    res.status(201).json({ success: true, data: result });
  }

  /**
   * POST /api/auth/login
   */
  async login(req, res) {
    const { username, password } = req.body || {};
    const result = await this.authService.login({ username, password });
    res.status(200).json({ success: true, data: result });
  }

  /**
   * GET /api/auth/me
   */
  async me(req, res) {
    const user = await this.authService.getCurrentUser(req.user.id);
    res.status(200).json({ success: true, data: user });
  }
}

module.exports = AuthController;
