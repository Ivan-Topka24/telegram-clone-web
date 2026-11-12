const env = require('./config/env');

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

// Application Services
const AuthService = require('./application/services/AuthService');
const UserService = require('./application/services/UserService');
const ChatService = require('./application/services/ChatService');
const MessageService = require('./application/services/MessageService');

// Presentation (HTTP & WebSockets)
const createAuthMiddleware = require('./presentation/http/middlewares/authMiddleware');
const createGlobalExceptionMiddleware = require('./presentation/http/middlewares/globalExceptionMiddleware');
const AuthController = require('./presentation/http/controllers/AuthController');
const UserController = require('./presentation/http/controllers/UserController');
const ChatController = require('./presentation/http/controllers/ChatController');
const createApiRouter = require('./presentation/http/routes/api.routes');
const createApp = require('./presentation/http/app');
const WsGatewayController = require('./presentation/ws/WsGatewayController');

/**
 * Composition Root: instantiates and wires all application dependencies.
 */
function createContainer() {
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
  const userRepository = new UserRepository();
  const chatRepository = new ChatRepository();
  const messageRepository = new MessageRepository();

  // Application Services
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
  });
  const messageService = new MessageService({
    unitOfWork,
    chatRepository,
    messageRepository,
    userRepository,
    realtimeNotifier,
  });

  // Presentation - HTTP
  const authMiddleware = createAuthMiddleware(jwtProvider);
  const globalExceptionMiddleware = createGlobalExceptionMiddleware(logger);
  const authController = new AuthController({ authService });
  const userController = new UserController({ userService });
  const chatController = new ChatController({ chatService, messageService });
  const apiRouter = createApiRouter({
    authController,
    userController,
    chatController,
    authMiddleware,
  });
  const app = createApp({
    apiRouter,
    globalExceptionMiddleware,
  });

  // Presentation - WebSockets
  const wsGatewayController = new WsGatewayController({
    jwtProvider,
    connectionManager,
    messageService,
    chatRepository,
    realtimeNotifier,
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
    authService,
    userService,
    chatService,
    messageService,
    authMiddleware,
    globalExceptionMiddleware,
    authController,
    userController,
    chatController,
    apiRouter,
    app,
    wsGatewayController,
  };
}

const container = createContainer();
container.createContainer = createContainer;

module.exports = container;
