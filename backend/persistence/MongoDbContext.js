const mongoose = require('mongoose');

/**
 * Manages the Mongoose MongoDB connection lifecycle.
 */
class MongoDbContext {
  /**
   * @param {object} config
   * @param {string} config.mongoUri
   * @param {{ info: Function, warn: Function, error: Function }} [config.logger]
   * @param {typeof mongoose} [config.mongooseInstance]
   */
  constructor({ mongoUri, logger = console, mongooseInstance = mongoose }) {
    if (!mongoUri) {
      throw new Error('MongoDbContext requires a mongoUri');
    }
    this.mongoUri = mongoUri;
    this.logger = logger;
    this.mongoose = mongooseInstance;
    this._listenersBound = false;
  }

  /**
   * Binds connection lifecycle event handlers once.
   */
  _bindListeners() {
    if (this._listenersBound) {
      return;
    }

    this.mongoose.connection.on('connected', () => {
      this.logger.info('MongoDB connected');
    });

    this.mongoose.connection.on('error', (err) => {
      this.logger.error('MongoDB connection error', err);
    });

    this.mongoose.connection.on('disconnected', () => {
      this.logger.warn('MongoDB disconnected');
    });

    this._listenersBound = true;
  }

  /**
   * Establishes the connection to MongoDB and ensures schema indexes are initialized.
   * @returns {Promise<typeof mongoose>}
   */
  async connect() {
    this._bindListeners();
    const connection = await this.mongoose.connect(this.mongoUri);
    await Promise.all(
      Object.values(this.mongoose.models).map((model) => model.init())
    );
    return connection;
  }

  /**
   * Closes the active MongoDB connection if open.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.mongoose.connection.readyState !== 0) {
      await this.mongoose.disconnect();
    }
  }
}

module.exports = MongoDbContext;
