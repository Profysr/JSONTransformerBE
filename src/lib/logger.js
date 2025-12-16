/**
 * 1. Both DEV/PROD MODE: Logs output immediately to the console in their respective format.
 * 2. PROD MODE: Logs are also stored in a buffer and sent to the backend
 */

import { getAccessToken } from "../auth/index.js";

class BatchLogger {
  constructor() {
    this.logBuffer = [];
    this.isProduction =
      process.env.NODE_ENV.toLowerCase() === "production" || false;
    this.verbose = process.env.verbose || true;

    console.log(
      `Logger initialized in ${
        this.isProduction ? "PRODUCTION" : "DEVELOPMENT"
      } mode.`
    );
  }

  _formatLog(level, message, meta) {
    const logEntry = {
      level: level,
      message: message,
      meta: { ...meta },
    };

    // Handle error objects if passed in meta for console output
    if (meta && meta.err instanceof Error) {
      logEntry.stack = meta.err.stack;
    }

    return logEntry;
  }

  /**
   * Handles immediate console output for both environments.
   */
  _logToConsole(logEntry) {
    if (this.isProduction) {
      // Production: Output a concise, stringified version
      const { level, message, meta } = logEntry;
      console.log(JSON.stringify({ level, message, meta }));
    } else {
      // Development: Output human-readable format
      const { level, message, stack, meta } = logEntry;
      let base = `[${level.toUpperCase()}]: ${stack || message}`;
      const metaObj = JSON.parse(meta);

      if (Object.keys(metaObj).length > 0) {
        base += ` | Meta: ${JSON.stringify(metaObj)}`;
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
      };

      if (Object.keys(logEntry.meta).length > 0) {
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

    const logsToSend = this.logBuffer; /** array that will store all logs */

    const payload = {
      letter_type: letter_type,
      nhs_number: nhs_id,
      letter_id,
      processing_logs: logsToSend,
    };

    // Clear the buffer immediately before the network call
    this.logBuffer = [];

    let success = false;
    let lastError = null;
    const MAX_ATTEMPTS = 3;
    
    // --- Retry Loop ---
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      try {
        /** Invoke access token in the loop because everytime, we want to make sure the token is valid */
        const accessToken = await getAccessToken("shary_prod");

        const response = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-type":"application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        // Check for successful HTTP status codes (2xx)
        if (response.ok) {
          console.log("BatchLogger: Logs successfully sent via HTTP.");
          success = true;
          break;
        }

        lastError = new Error(`HTTP status failure: ${response}`);
      } catch (error) {
        lastError = error;
      }

      // Log the failed i, but only retry if we haven't hit the max attempts
      if (!success && i < MAX_ATTEMPTS) {
        console.warn(
          `Logger: Attempt ${i} failed (${lastError.message}). Retrying in 3 second...`
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    // --- End of Retry Loop ---

    // Final check after the loop finishes
    if (!success) {
      console.error(
        `Logger: All ${MAX_ATTEMPTS} attempts failed. Final error: ${lastError.message}. Logs retained for next scheduled http.`
      );

      // Re-add failed logs to the beginning of the buffer.
      this.logBuffer.unshift(...logsToSend);
    }
  }
}

const logger = new BatchLogger();
export default logger;
