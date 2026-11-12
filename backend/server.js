const http = require('http');
const { createContainer } = require('./container');

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Bootstraps the database connection, HTTP server, and WebSocket gateway.
 */
async function bootstrap() {
  const container = createContainer();
  const { env, logger, mongoDbContext, app, wsGatewayController } = container;

  await mongoDbContext.connect();

  const server = http.createServer(app);
  wsGatewayController.initialize(server);

  server.listen(env.PORT, () => {
    logger.info(`Telegram Web Clone server listening on http://localhost:${env.PORT}`);
  });

  let isShuttingDown = false;
  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}; shutting down gracefully`);

    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      await wsGatewayController.close();
      await new Promise((resolve) => server.close(() => resolve()));
      await mongoDbContext.disconnect();
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', err);
    shutdown('uncaughtException');
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
