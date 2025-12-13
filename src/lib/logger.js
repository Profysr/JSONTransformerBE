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

const transports = [];

// In Development: Console + File
// In Production: (As per user request, we can keep it dynamic or restrict it. 
// For now, adhering to "dev only -> console + file" as primary instruction implies 

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
    // Production configuration
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
