const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const { NotFoundException } = require('../../../domain/exceptions');

/**
 * Configures and returns the REST API router under /api.
 * @param {object} deps
 * @param {import('../controllers/AuthController')} deps.authController
 * @param {import('../controllers/UserController')} deps.userController
 * @param {import('../controllers/ChatController')} deps.chatController
 * @param {import('express').RequestHandler} deps.authMiddleware
 * @returns {import('express').Router}
 */
function createApiRouter({ authController, userController, chatController, authMiddleware }) {
  const router = express.Router();

  // Auth routes
  router.post('/auth/register', asyncHandler((req, res) => authController.register(req, res)));
  router.post('/auth/login', asyncHandler((req, res) => authController.login(req, res)));
  router.get('/auth/me', authMiddleware, asyncHandler((req, res) => authController.me(req, res)));

  // User routes
  router.get(
    '/users/search',
    authMiddleware,
    asyncHandler((req, res) => userController.searchUsers(req, res))
  );

  // Chat & Message routes
  router.get(
    '/chats',
    authMiddleware,
    asyncHandler((req, res) => chatController.getUserChats(req, res))
  );
  router.post(
    '/chats/direct',
    authMiddleware,
    asyncHandler((req, res) => chatController.createDirectChat(req, res))
  );
  router.post(
    '/chats/group',
    authMiddleware,
    asyncHandler((req, res) => chatController.createGroupChat(req, res))
  );
  router.get(
    '/chats/:chatId/messages',
    authMiddleware,
    asyncHandler((req, res) => chatController.getMessages(req, res))
  );

  // Return structured 404 JSON for unknown /api/* endpoints
  router.use((_req, _res, next) => {
    next(new NotFoundException('API endpoint not found', 'ENDPOINT_NOT_FOUND'));
  });

  return router;
}

module.exports = createApiRouter;
