const defaultConfig = require('./config/env');

// Infrastructure
const Logger = require('./infrastructure/logging/Logger');
const PasswordHasher = require('./infrastructure/security/PasswordHasher');
const JwtProvider = require('./infrastructure/security/JwtProvider');
const ConnectionManager = require('./infrastructure/realtime/ConnectionManager');
const WsRealtimeNotifier = require('./infrastructure/realtime/WsRealtimeNotifier');

// Persistence
const MongoDbContext = require('./persistence/MongoDbContext');
const UnitOfWork = require('./persistence/UnitOfWork');
const UserRepository = require('./persistence/repositories/UserRepository');
const ChatRepository = require('./persistence/repositories/ChatRepository');
const MessageRepository = require('./persistence/repositories/MessageRepository');

// Application Mappers & Services
const ChatDtoMapper = require('./application/mappers/ChatDtoMapper');
const MessageDtoMapper = require('./application/mappers/MessageDtoMapper');
const AuthService = require('./application/services/AuthService');
const UserService = require('./application/services/UserService');
const ChatService = require('./application/services/ChatService');
const MessageService = require('./application/services/MessageService');
const PresenceService = require('./application/services/PresenceService');

// Presentation (HTTP & WebSockets)
const createAuthMiddleware = require('./presentation/http/middlewares/authMiddleware');
const createGlobalExceptionMiddleware = require('./presentation/http/middlewares/globalExceptionMiddleware');
const createRateLimitMiddleware = require('./presentation/http/middlewares/rateLimitMiddleware');
const AuthController = require('./presentation/http/controllers/AuthController');
const UserController = require('./presentation/http/controllers/UserController');
const ChatController = require('./presentation/http/controllers/ChatController');
const createApiRouter = require('./presentation/http/routes/api.routes');
const createApp = require('./presentation/http/app');
const WsGatewayController = require('./presentation/ws/WsGatewayController');

/**
 * Composition Root: instantiates and wires all application dependencies without import-time side effects.
 * @param {Partial<typeof defaultConfig>} [configOverrides={}]
 * @returns {object}
 */
function createContainer(configOverrides = {}) {
  const env = { ...defaultConfig, ...configOverrides };

  // Infrastructure
  const logger = new Logger();
  const passwordHasher = new PasswordHasher();
  const jwtProvider = new JwtProvider({
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  });
  const connectionManager = new ConnectionManager();
  const realtimeNotifier = new WsRealtimeNotifier(connectionManager);

  // Persistence
  const mongoDbContext = new MongoDbContext({
    mongoUri: env.MONGO_URI,
    logger,
  });
  const unitOfWork = new UnitOfWork({ logger });
  const userRepository = new UserRepository({ unitOfWork });
  const chatRepository = new ChatRepository({ unitOfWork });
  const messageRepository = new MessageRepository({ unitOfWork });

  // Application Mappers & Services
  const chatDtoMapper = new ChatDtoMapper();
  const messageDtoMapper = new MessageDtoMapper();
  const authService = new AuthService({
    userRepository,
    passwordHasher,
    jwtProvider,
  });
  const userService = new UserService({
    userRepository,
  });
  const chatService = new ChatService({
    chatRepository,
    userRepository,
    realtimeNotifier,
    chatDtoMapper,
    logger,
  });
  const messageService = new MessageService({
    unitOfWork,
    chatRepository,
    messageRepository,
    userRepository,
    realtimeNotifier,
    messageDtoMapper,
    logger,
  });
  const presenceService = new PresenceService({
    chatRepository,
    realtimeNotifier,
  });

  // Presentation - HTTP
  const authMiddleware = createAuthMiddleware(jwtProvider);
  const globalExceptionMiddleware = createGlobalExceptionMiddleware(logger);
  const authRateLimiter = createRateLimitMiddleware({
    windowMs: 60_000,
    maxRequests: env.NODE_ENV === 'test' ? 200 : 30,
  });
  const authController = new AuthController({ authService });
  const userController = new UserController({ userService });
  const chatController = new ChatController({ chatService, messageService });
  const apiRouter = createApiRouter({
    authController,
    userController,
    chatController,
    authMiddleware,
    authRateLimiter,
  });
  const app = createApp({
    apiRouter,
    globalExceptionMiddleware,
    corsOrigin: env.CORS_ORIGIN || null,
  });

  // Presentation - WebSockets
  const wsGatewayController = new WsGatewayController({
    jwtProvider,
    connectionManager,
    messageService,
    presenceService,
    logger,
  });

  return {
    env,
    logger,
    passwordHasher,
    jwtProvider,
    connectionManager,
    realtimeNotifier,
    mongoDbContext,
    unitOfWork,
    userRepository,
    chatRepository,
    messageRepository,
    chatDtoMapper,
    messageDtoMapper,
    authService,
    userService,
    chatService,
    messageService,
    presenceService,
    authMiddleware,
    globalExceptionMiddleware,
    authRateLimiter,
    authController,
    userController,
    chatController,
    apiRouter,
    app,
    wsGatewayController,
  };
}

module.exports = { createContainer };
