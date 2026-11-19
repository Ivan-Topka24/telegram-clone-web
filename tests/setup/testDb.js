const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server');

const MIN_REQUIRED_BYTES = 600 * 1024 * 1024;
const WORKSPACE_TEMP_ROOT = path.resolve(__dirname, '../../.temp/mongo');

let mongoServer = null;
let customDbPath = null;

/**
 * Returns a writable directory with sufficient free disk space for WiredTiger when
 * the OS temp volume is below MongoDB's 500 MB minimum free-space threshold.
 * @returns {string|null}
 */
function resolveFallbackDbPath() {
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(os.tmpdir());
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      if (freeBytes >= MIN_REQUIRED_BYTES) {
        return null;
      }
    } else {
      return null;
    }
  } catch (_err) {
    return null;
  }

  fs.mkdirSync(WORKSPACE_TEMP_ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(WORKSPACE_TEMP_ROOT, 'mms-'));
}

/**
 * Starts an in-memory MongoDB replica set (falling back to standalone with warning if needed)
 * and connects Mongoose.
 */
async function connect() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  customDbPath = resolveFallbackDbPath();

  try {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      ...(customDbPath ? { instanceOpts: [{ dbPath: customDbPath }] } : {}),
    });
  } catch (err) {
    console.warn(
      `[testDb] MongoMemoryReplSet unavailable (${err.message}); falling back to standalone MongoMemoryServer (transactions will use fallback)`
    );
    mongoServer = await MongoMemoryServer.create(
      customDbPath ? { instance: { dbPath: customDbPath } } : undefined
    );
  }

  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init())
  );
}

/**
 * Deletes all documents from every Mongoose collection between tests.
 */
async function clearDatabase() {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const collections = mongoose.connection.collections;
  const deletions = Object.values(collections).map((collection) =>
    collection.deleteMany({})
  );
  await Promise.all(deletions);
}

/**
 * Disconnects Mongoose and stops the in-memory MongoDB server.
 */
async function closeDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }

  if (customDbPath) {
    fs.rmSync(customDbPath, { recursive: true, force: true });
    customDbPath = null;
  }
}

module.exports = {
  connect,
  clearDatabase,
  closeDatabase,
};
