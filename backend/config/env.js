const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3000,
  MONGO_URI:
    process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/telegram_clone?replicaSet=rs0',
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
};
