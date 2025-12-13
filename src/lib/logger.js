// import winston from "winston";

// const { combine, timestamp, json, errors, colorize, printf } = winston.format;

// // 1. Define the custom console format for human readability
// const consoleFormat = printf(
//   ({ level, message, timestamp, stack, ...meta }) => {
//     const base = `${timestamp} [${level}]: ${stack || message}`;

//     // Append any extra context (meta data) to the log line
//     if (Object.keys(meta).length > 0) {
//       return `${base} | Meta: ${JSON.stringify(meta, null, 2)}`;
//     }
//     return base;
//   }
// );

// const transports = [];

// // In Development: Console + File
// // In Production: (As per user request, we can keep it dynamic or restrict it.
// // For now, adhering to "dev only -> console + file" as primary instruction implies

// if (process.env.NODE_ENV !== 'production') {
//     transports.push(
//         new winston.transports.Console({
//             level: "debug",
//             format: combine(colorize({ all: true }), consoleFormat),
//         })
//     );
//     transports.push(
//         new winston.transports.File({
//             filename: "logs/structured.log",
//             level: "info",
//         })
//     );
// } else {
//     // Production configuration
//     transports.push(
//         new winston.transports.Console({
//             level: "info",
//             format: json(),
//         })
//     );
// }

// // --- Configuration ---
// const logger = winston.createLogger({
//   level: "info",
//   format: combine(
//     errors({ stack: true }),
//     timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
//     json()
//   ),
//   transports: transports,
// });

// export default logger;

/**
 * A streamlined custom logger controlled by environment mode.
 * * Behavior based on process.env.NODE_ENV:
 * 1. DEV MODE: Logs output immediately to the console only. Buffer is ignored.
 * 2. PROD MODE: Logs are stored in a buffer and sent to the backend
 * in a single batch via .flushHttp(). Console is used for structured logging.
 */
class BatchLogger {
  constructor() {
    this.logBuffer = [];
    this.isProduction = process.env.NODE_ENV === "production";
    this.verbose = process.env.verbose || true;

    console.log(
      `Logger initialized in ${
        this.isProduction ? "PRODUCTION" : "DEVELOPMENT"
      } mode.`
    );
  }

  /**
   * Creates the structured log object.
   */
  _formatLog(level, message, meta) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      ...meta,
    };

    // Handle error objects if passed in meta
    if (meta && meta.err instanceof Error) {
      logEntry.stack = meta.err.stack;
      delete logEntry.err;
    }

    return logEntry;
  }

  /**
   * Handles immediate console output.
   */
  _logToConsole(logEntry) {
    if (this.isProduction) {
      console.log(JSON.stringify(logEntry));
    } else {
      // Development: Output human-readable format
      const { timestamp, level, message, stack, ...meta } = logEntry;
      let base = `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;

      if (Object.keys(meta).length > 0) {
        base += ` | Meta: ${JSON.stringify(meta)}`;
      }
      console.log(base);
    }
  }

  /**
   * The main logging function.
   */
  log(level, message, meta) {
    // Suppress debug logs unless verbose mode is enabled
    if (level === "debug" && !this.verbose) {
      return;
    }

    const logEntry = this._formatLog(level, message, meta);

    if (this.isProduction) {
      this.logBuffer.push(logEntry);
    } else {
      this._logToConsole(logEntry);
    }
  }

  // --- Level-Specific Wrappers ---

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
   * Sends the entire accumulated log buffer to a backend endpoint
   * in a single HTTP request and then clears the buffer.
   * This method should only be called in Production mode.
   */

  async flushHttp(endpointUrl) {
    if (!this.isProduction) {
      console.warn(
        "BatchLogger: flushHttp called in DEVELOPMENT mode. No action taken."
      );
      return;
    }

    if (this.logBuffer.length === 0) {
      console.log("BatchLogger: Buffer is empty. Nothing to send.");
      return;
    }

    const logsToSend = this.logBuffer;

    this.logBuffer = [];

    let success = false;
    let lastError = null;
    const MAX_ATTEMPTS = 3;

    // --- Retry Loop ---
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      try {
        const response = await fetch(endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logsToSend),
        });

        // 3. Check for successful HTTP status codes (2xx)
        if (response.ok) {
          console.log("BatchLogger: Logs successfully flushed via HTTP.");
          success = true;
          break;
        }
        lastError = new Error(`HTTP status failure: ${response.status}`);
      } catch (error) {
        lastError = error;
      }

      // 4. Log the failed i, but only retry if we haven't hit the max attempts
      if (!success && i < MAX_ATTEMPTS) {
        console.warn(
          `Logger: Attempt ${i} failed (${lastError.message}). Retrying in 3 second...`
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    // --- End of Retry Loop ---

    // 5. Final check after the loop finishes
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
