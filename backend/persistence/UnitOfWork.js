const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const IUnitOfWork = require('../domain/interfaces/IUnitOfWork');

/**
 * Checks whether an error indicates MongoDB is running as a standalone instance
 * without replica set transaction support.
 * @param {unknown} err
 * @returns {boolean}
 */
function isTransactionUnsupportedError(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const message = typeof err.message === 'string' ? err.message : '';
  return (
    err.code === 20 ||
    message.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
    message.includes('transactions are not supported')
  );
}

/**
 * Mongoose-backed Unit of Work managing multi-document transactions via AsyncLocalStorage.
 */
class UnitOfWork extends IUnitOfWork {
  /**
   * @param {object} [options]
   * @param {{ warn: Function }} [options.logger]
   * @param {typeof mongoose} [options.mongooseInstance]
   */
  constructor({ logger = null, mongooseInstance = mongoose } = {}) {
    super();
    this.logger = logger;
    this.mongoose = mongooseInstance;
    this._sessionStorage = new AsyncLocalStorage();
    /** @type {boolean|null} Cached replica-set transaction support state */
    this._transactionsSupported = null;
  }

  /**
   * Returns the active Mongoose ClientSession for the current async execution scope, if any.
   * @returns {import('mongoose').ClientSession|null}
   */
  getSession() {
    return this._sessionStorage.getStore() ?? null;
  }

  /**
   * Executes workCallback inside an ambient MongoDB transaction scope.
   * Falls back to non-transactional execution when running against a standalone MongoDB
   * and caches that capability so subsequent calls avoid failed session round-trips.
   * @param {() => Promise<any>} workCallback
   * @returns {Promise<any>}
   */
  async execute(workCallback) {
    if (this._transactionsSupported === false) {
      return this._sessionStorage.run(null, workCallback);
    }

    const session = await this.mongoose.startSession();
    let fallbackRequired = false;

    try {
      session.startTransaction();
      const result = await this._sessionStorage.run(session, workCallback);
      await session.commitTransaction();
      this._transactionsSupported = true;
      return result;
    } catch (err) {
      if (session.inTransaction()) {
        await session.abortTransaction().catch(() => {});
      }

      if (isTransactionUnsupportedError(err)) {
        this._transactionsSupported = false;
        fallbackRequired = true;
      } else {
        throw err;
      }
    } finally {
      await session.endSession();
    }

    if (fallbackRequired) {
      if (this.logger && typeof this.logger.warn === 'function') {
        this.logger.warn(
          'MongoDB transactions unavailable (standalone instance); executing without transaction session'
        );
      }
      return this._sessionStorage.run(null, workCallback);
    }
  }
}

module.exports = UnitOfWork;
