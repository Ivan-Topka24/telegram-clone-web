const mongoose = require('mongoose');
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer = null;

/**
 * Starts an in-memory MongoDB replica set (falling back to standalone if needed)
 * and connects Mongoose.
 */
async function connect() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  try {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
  } catch (_err) {
    mongoServer = await MongoMemoryServer.create();
  }

  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
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
}

module.exports = {
  connect,
  clearDatabase,
  closeDatabase,
};
