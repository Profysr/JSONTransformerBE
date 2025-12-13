import winston from "winston";

const { combine, timestamp, json, errors, colorize, printf } = winston.format;

// 1. Define the custom console format for human readability
const consoleFormat = printf(
  ({ level, message, timestamp, stack, ...meta }) => {
    const base = `${timestamp} [${level}]: ${stack || message}`;

    // Append any extra context (meta data) to the log line
    if (Object.keys(meta).length > 0) {
      return `${base} | Meta: ${JSON.stringify(meta, null, 2)}`;
    }
    return base;
  }
);

// Determine transports based on environment
const transports = [];

// In Development: Console + File
// In Production: (As per user request, we can keep it dynamic or restrict it. 
// For now, adhering to "dev only -> console + file" as primary instruction implies 
// we might want less verbose or different logging in prod, but let's stick to the plan:
// "make it dynamically as when the project is under dev only, then use console and file structure.")

if (process.env.NODE_ENV !== 'production') {
    transports.push(
        new winston.transports.Console({
            level: "debug",
            format: combine(colorize({ all: true }), consoleFormat),
        })
    );
    transports.push(
        new winston.transports.File({
            filename: "logs/structured.log",
            level: "info",
        })
    );
} else {
    // Production configuration example (user said "future backend server")
    // For now, we can just log to console JSON for standard stdout collection services like CloudWatch/Datadog
    transports.push(
        new winston.transports.Console({
            level: "info",
            format: json(), 
        })
    );
}

// --- Configuration ---
const logger = winston.createLogger({
  level: "info",
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    json()
  ),
  transports: transports,
});

export default logger;
