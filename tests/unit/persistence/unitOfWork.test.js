const UnitOfWork = require('../../../backend/persistence/UnitOfWork');

describe('Persistence Layer — UnitOfWork', () => {
  test('commits transaction and exposes session via AsyncLocalStorage', async () => {
    const mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
      inTransaction: jest.fn().mockReturnValue(true),
    };
    const mockMongoose = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    const uow = new UnitOfWork({ mongooseInstance: mockMongoose });
    expect(uow.getSession()).toBeNull();

    const result = await uow.execute(async () => {
      expect(uow.getSession()).toBe(mockSession);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(uow.getSession()).toBeNull();
    expect(mockSession.startTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.commitTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
  });

  test('caches standalone fallback when transactions are unsupported', async () => {
    const unsupportedErr = new Error(
      'Transaction numbers are only allowed on a replica set member or mongos'
    );
    unsupportedErr.code = 20;

    const mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
      inTransaction: jest.fn().mockReturnValue(true),
    };
    const mockMongoose = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };
    const logger = { warn: jest.fn() };
    const uow = new UnitOfWork({ logger, mongooseInstance: mockMongoose });

    let attempts = 0;
    const res1 = await uow.execute(async () => {
      attempts += 1;
      if (uow.getSession()) {
        throw unsupportedErr;
      }
      return 'fallback-1';
    });

    const res2 = await uow.execute(async () => {
      expect(uow.getSession()).toBeNull();
      return 'fallback-2';
    });

    expect(res1).toBe('fallback-1');
    expect(res2).toBe('fallback-2');
    expect(attempts).toBe(2);
    expect(mockMongoose.startSession).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
