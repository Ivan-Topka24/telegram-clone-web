/**
 * Structured console logger attaching ISO-8601 timestamps to log entries.
 */
class Logger {
  /**
   * Formats and writes a structured log entry.
   * @param {'INFO'|'WARN'|'ERROR'} level
   * @param {string} message
   * @param {unknown} [meta]
   */
  _write(level, message, meta) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (meta !== undefined) {
      entry.meta = meta instanceof Error
        ? { name: meta.name, message: meta.message, stack: meta.stack }
        : meta;
    }

    const line = JSON.stringify(entry);
    if (level === 'ERROR') {
      console.error(line);
    } else if (level === 'WARN') {
      console.warn(line);
    } else {
      console.info(line);
    }
  }

  /**
   * Logs an informational message.
   * @param {string} msg
   * @param {unknown} [meta]
   */
  info(msg, meta) {
    this._write('INFO', msg, meta);
  }

  /**
   * Logs a warning message.
   * @param {string} msg
   * @param {unknown} [meta]
   */
  warn(msg, meta) {
    this._write('WARN', msg, meta);
  }

  /**
   * Logs an error message along with optional Error or metadata details.
   * @param {string} msg
   * @param {Error|unknown} [err]
   */
  error(msg, err) {
    this._write('ERROR', msg, err);
  }
}

module.exports = Logger;
