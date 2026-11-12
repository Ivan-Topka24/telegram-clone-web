/**
 * Contract for managing atomic multi-document database transactions.
 */
class IUnitOfWork {
  /**
   * Executes the provided asynchronous callback inside a transaction boundary.
   * @param {(session: any) => Promise<any>} work
   * @returns {Promise<any>}
   */
  async execute(work) {
    throw new Error('Not implemented');
  }
}

module.exports = IUnitOfWork;
