/**
 * 1. Both DEV/PROD MODE: Logs output immediately to the console in their respective format.
 * 2. PROD MODE: Logs are also stored in a buffer and sent to the backend
 */

import { getAccessToken } from "./providers/auth.service.js";
import { makeRequestWithRetry } from "./providers/requestClient.js";

class BatchLogger {
  constructor() {
    this.logBuffer = [];
    this.isProduction =
      process.env.NODE_ENV?.toLowerCase() === "production" || false;
    this.verbose = process.env.verbose || true;

    console.log(
      `Logger initialized in ${this.isProduction ? "PRODUCTION" : "DEVELOPMENT"
      } mode.`
    );
  }

  _formatLog(level, message, meta) {
    const { sectionKey, functionName, fieldKey, ...restMeta } = meta || {};
    const logEntry = {
      level: level,
      message: message,
      meta: restMeta,
    };

    if (sectionKey) logEntry.sectionKey = sectionKey;
    if (functionName) logEntry.functionName = functionName;
    if (fieldKey) logEntry.fieldKey = fieldKey;

    // Handle error objects if passed in meta for console output
    if (restMeta && restMeta.err instanceof Error) {
      logEntry.stack = restMeta.err.stack;
    }

    return logEntry;
  }

  /**
   * Handles immediate console output for both environments.
   */
  _logToConsole(logEntry) {
    const { level, message, stack, meta, sectionKey, functionName, fieldKey } = logEntry;

    if (this.isProduction) {
      console.log(JSON.stringify({ level, sectionKey, functionName, fieldKey, message, meta }));
    } else {
      // Development: Output human-readable format
      const sectionTag = sectionKey ? `[${sectionKey}] ` : "";
      const functionTag = functionName ? `[${functionName}] ` : "";
      const fieldTag = fieldKey ? `[${fieldKey}] ` : "";
      let base = `${sectionTag}${functionTag}${fieldTag}[${level.toUpperCase()}]: ${stack || message}`;

      if (meta && Object.keys(meta).length > 0) {
        const { err: _err, ...cleanMeta } = meta;
        if (Object.keys(cleanMeta).length > 0) {
          base += ` | Meta: ${JSON.stringify(cleanMeta, null, 2)}`;
        }
      }
      console.log(base);
    }
  }

  /**
   * The main logging function.
   */
  log(level, message, meta = {}) {
    if (level === "debug" && !this.verbose) {
      return;
    }

    const logEntry = this._formatLog(level, message, meta);

    this._logToConsole(logEntry);

    // 2. Buffer the log ONLY in Production mode
    if (this.isProduction) {
      const bufferEntry = {
        level: logEntry.level,
        message: logEntry.message,
        sectionKey: logEntry.sectionKey,
        functionName: logEntry.functionName,
        fieldKey: logEntry.fieldKey
      };

      if (logEntry.meta && Object.keys(logEntry.meta).length > 0) {
        bufferEntry["meta"] = logEntry.meta;
      }

      this.logBuffer.push(bufferEntry);
    }
  }

  info(message, meta) {
    this.log("info", message, meta);
  }
  warn(message, meta) {
    this.log("warn", message, meta);
  }
  error(message, meta) {
    this.log("error", message, meta);
  }
  debug(message, meta) {
    this.log("debug", message, meta);
  }

  /**
   * Sends the accumulated log buffer to a backend endpoint.
   */
  async sendLogs(endpointUrl, letter_type, nhs_id, letter_id) {
    if (!this.isProduction) {
      console.warn(
        "BatchLogger: sendLogs called in DEVELOPMENT mode. No action taken."
      );
      return;
    }

    if (this.logBuffer.length === 0) {
      console.log("BatchLogger: Buffer is empty. Nothing to send.");
      return;
    }

    // Validate required contextual data
    if (!letter_type || !nhs_id) {
      console.error(
        "BatchLogger: Missing required contextual data (letter_type or nhs_id). Logs retained."
      );
      return;
    }

    const payload = {
      letter_type: letter_type,
      nhs_number: nhs_id,
      letter_id,
      processing_logs: this.logBuffer,
    };

    // Clear the buffer immediately before the network call
    this.logBuffer = [];

    try {
      await makeRequestWithRetry(
        () => getAccessToken("shary_prod"),
        endpointUrl,
        "POST",
        payload,
        {
          maxAttempts: 3,
          retryDelay: 3000,
          logPrefix: "BatchLogger"
        }
      );

      console.log("BatchLogger: Logs successfully sent via HTTP.");
    } catch (error) {
      console.error(
        `BatchLogger: Failed to send logs after all attempts. Error: ${error.message}. Payload:`,
        payload
      );
    }
  }
}

const logger = new BatchLogger();
export default logger;
