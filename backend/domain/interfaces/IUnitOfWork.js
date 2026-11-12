/**
 * Contract for managing atomic multi-document database transactions via ambient scope.
 */
class IUnitOfWork {
  /**
   * Executes the provided asynchronous callback inside a transaction boundary.
   * @param {() => Promise<any>} work
   * @returns {Promise<any>}
   */
  async execute(work) {
    throw new Error('Not implemented');
  }
}

module.exports = IUnitOfWork;
