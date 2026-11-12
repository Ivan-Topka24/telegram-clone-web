const path = require('path');
const express = require('express');

/**
 * Configures and returns the Express application instance.
 * @param {object} deps
 * @param {import('express').Router} deps.apiRouter
 * @param {import('express').ErrorRequestHandler} deps.globalExceptionMiddleware
 * @returns {import('express').Express}
 */
function createApp({ apiRouter, globalExceptionMiddleware }) {
  const app = express();

  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(express.static(path.join(__dirname, '../../../frontend')));
  app.use(globalExceptionMiddleware);

  return app;
}

module.exports = createApp;
