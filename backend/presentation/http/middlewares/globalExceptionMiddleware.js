const { DomainException } = require('../../../domain/exceptions');

/**
 * Creates the terminal Express error-handling middleware.
 * @param {{ error: Function }} logger
 * @returns {import('express').ErrorRequestHandler}
 */
function createGlobalExceptionMiddleware(logger) {
  return (err, req, res, _next) => {
    if (err instanceof DomainException) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }

    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Malformed JSON request body',
        },
      });
    }

    if (logger && typeof logger.error === 'function') {
      logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
  };
}

module.exports = createGlobalExceptionMiddleware;
