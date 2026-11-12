const http = require('http');
const env = require('./config/env');
const container = require('./container');

/**
 * Bootstraps the database connection, HTTP server, and WebSocket gateway.
 */
async function bootstrap() {
  const { logger, mongoDbContext, app, wsGatewayController } = container;

  await mongoDbContext.connect();

  const server = http.createServer(app);
  wsGatewayController.initialize(server);

  server.listen(env.PORT, () => {
    logger.info(`Telegram Web Clone server listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}; shutting down gracefully`);
    await wsGatewayController.close();
    await new Promise((resolve) => server.close(() => resolve()));
    await mongoDbContext.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  container.logger.error('Failed to start server', err);
  process.exit(1);
});
