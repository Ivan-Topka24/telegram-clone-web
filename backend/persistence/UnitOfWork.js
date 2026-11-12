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
 * Mongoose-backed Unit of Work managing multi-document transactions.
 */
class UnitOfWork extends IUnitOfWork {
  /**
   * @param {object} [options]
   * @param {{ warn: Function }} [options.logger]
   */
  constructor({ logger = null } = {}) {
    super();
    this.logger = logger;
  }

  /**
   * Executes workCallback inside a MongoDB transaction.
   * Falls back to non-transactional execution when running against a standalone local MongoDB.
   * @param {(session: import('mongoose').ClientSession|null) => Promise<any>} workCallback
   * @returns {Promise<any>}
   */
  async execute(workCallback) {
    const session = await mongoose.startSession();
    let fallbackRequired = false;

    try {
      session.startTransaction();
      const result = await workCallback(session);
      await session.commitTransaction();
      return result;
    } catch (err) {
      if (session.inTransaction()) {
        await session.abortTransaction().catch(() => {});
      }

      if (isTransactionUnsupportedError(err)) {
        fallbackRequired = true;
      } else {
        throw err;
      }
    } finally {
      await session.endSession();
    }

    if (fallbackRequired) {
      if (this.logger && typeof this.logger.warn === 'function') {
        this.logger.warn('MongoDB transactions unavailable (standalone instance); executing without transaction session');
      }
      return workCallback(null);
    }
  }
}

module.exports = UnitOfWork;
