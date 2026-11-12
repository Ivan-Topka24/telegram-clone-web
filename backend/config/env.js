const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const INSECURE_JWT_SECRETS = new Set([
  'super_secret_jwt_key',
  'replace_with_a_strong_random_secret_at_least_32_characters',
  'secret',
  'changeme',
]);
const MIN_PROD_JWT_SECRET_LENGTH = 32;
const TEST_FALLBACK_JWT_SECRET = 'test_only_ephemeral_jwt_secret_for_jest_suite';

/**
 * Resolves and validates the JWT signing secret from environment variables.
 * Fails fast in non-test environments when missing, and rejects weak placeholders in production.
 * @param {NodeJS.ProcessEnv} envSource
 * @param {string} nodeEnv
 * @returns {string}
 */
function resolveJwtSecret(envSource, nodeEnv) {
  const secret = typeof envSource.JWT_SECRET === 'string' ? envSource.JWT_SECRET.trim() : '';

  if (!secret) {
    if (nodeEnv === 'test') {
      return TEST_FALLBACK_JWT_SECRET;
    }
    throw new Error('Missing required environment variable: JWT_SECRET');
  }

  if (
    nodeEnv === 'production' &&
    (INSECURE_JWT_SECRETS.has(secret) || secret.length < MIN_PROD_JWT_SECRET_LENGTH)
  ) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_PROD_JWT_SECRET_LENGTH} characters and not a default placeholder in production`
    );
  }

  return secret;
}

/**
 * Builds validated runtime configuration from an environment map.
 * @param {NodeJS.ProcessEnv} [envSource=process.env]
 * @returns {{
 *   NODE_ENV: string,
 *   PORT: number,
 *   MONGO_URI: string,
 *   JWT_SECRET: string,
 *   JWT_EXPIRES_IN: string,
 *   CORS_ORIGIN: string|null
 * }}
 */
function loadConfig(envSource = process.env) {
  const nodeEnv = envSource.NODE_ENV || 'development';
  const port = Number(envSource.PORT);

  return {
    NODE_ENV: nodeEnv,
    PORT: Number.isInteger(port) && port > 0 ? port : 3000,
    MONGO_URI:
      envSource.MONGO_URI || 'mongodb://127.0.0.1:27017/telegram_clone?replicaSet=rs0',
    JWT_SECRET: resolveJwtSecret(envSource, nodeEnv),
    JWT_EXPIRES_IN: envSource.JWT_EXPIRES_IN || '7d',
    CORS_ORIGIN: envSource.CORS_ORIGIN || null,
  };
}

const config = loadConfig(process.env);
config.loadConfig = loadConfig;

module.exports = config;
