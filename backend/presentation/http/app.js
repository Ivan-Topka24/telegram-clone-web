const path = require('path');
const express = require('express');
const createSecurityHeadersMiddleware = require('./middlewares/securityHeadersMiddleware');

/**
 * Configures and returns the Express application instance.
 * @param {object} deps
 * @param {import('express').Router} deps.apiRouter
 * @param {import('express').ErrorRequestHandler} deps.globalExceptionMiddleware
 * @param {string|null} [deps.corsOrigin=null]
 * @returns {import('express').Express}
 */
function createApp({ apiRouter, globalExceptionMiddleware, corsOrigin = null }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(createSecurityHeadersMiddleware());

  if (corsOrigin) {
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
      return next();
    });
  }

  app.use(express.json({ limit: '64kb' }));
  app.use('/api', apiRouter);
  app.use(express.static(path.join(__dirname, '../../../frontend')));
  app.use(globalExceptionMiddleware);

  return app;
}

module.exports = createApp;
