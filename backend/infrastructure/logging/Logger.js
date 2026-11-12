/**
 * Formats an Error instance into a plain serializable object, including cause chains.
 * @param {Error} err
 * @param {WeakSet<object>} seen
 * @returns {object}
 */
function serializeError(err, seen) {
  if (seen.has(err)) {
    return '[Circular Error]';
  }
  seen.add(err);

  const formatted = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };

  if (err.code !== undefined) {
    formatted.code = err.code;
  }

  if (err.cause !== undefined) {
    formatted.cause = sanitizeForJson(err.cause, seen);
  }

  return formatted;
}

/**
 * Recursively converts values into JSON-safe structures without throwing on circular references or BigInt.
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @returns {unknown}
 */
function sanitizeForJson(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return serializeError(value, seen);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJson(item, seen));
  }

  const output = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== 'function' && typeof entryValue !== 'symbol') {
      output[key] = sanitizeForJson(entryValue, seen);
    }
  }
  return output;
}

/**
 * Structured console logger attaching ISO-8601 timestamps to log entries.
 */
class Logger {
  /**
   * Formats and writes a structured log entry safely without throwing on circular metadata.
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
      entry.meta = sanitizeForJson(meta);
    }

    let line;
    try {
      line = JSON.stringify(entry);
    } catch (_err) {
      line = JSON.stringify({
        timestamp: entry.timestamp,
        level,
        message,
        meta: '[Unserializable metadata]',
      });
    }

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
