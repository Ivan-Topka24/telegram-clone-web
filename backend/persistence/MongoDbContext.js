const mongoose = require('mongoose');

/**
 * Manages the Mongoose MongoDB connection lifecycle.
 */
class MongoDbContext {
  /**
   * @param {object} config
   * @param {string} config.mongoUri
   * @param {{ info: Function, warn: Function, error: Function }} [config.logger]
   */
  constructor({ mongoUri, logger = console }) {
    if (!mongoUri) {
      throw new Error('MongoDbContext requires a mongoUri');
    }
    this.mongoUri = mongoUri;
    this.logger = logger;
    this._listenersBound = false;
  }

  /**
   * Binds connection lifecycle event handlers once.
   */
  _bindListeners() {
    if (this._listenersBound) {
      return;
    }

    mongoose.connection.on('connected', () => {
      this.logger.info('MongoDB connected');
    });

    mongoose.connection.on('error', (err) => {
      this.logger.error('MongoDB connection error', err);
    });

    mongoose.connection.on('disconnected', () => {
      this.logger.warn('MongoDB disconnected');
    });

    this._listenersBound = true;
  }

  /**
   * Establishes the connection to MongoDB.
   * @returns {Promise<typeof mongoose>}
   */
  async connect() {
    this._bindListeners();
    return mongoose.connect(this.mongoUri);
  }

  /**
   * Closes the active MongoDB connection if open.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

module.exports = MongoDbContext;
