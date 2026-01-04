import express from "express";
import router from "./routes/index.js";
import logger from "./lib/logger.js";
import { errorMiddleware } from "./middleware/errorHandler.js";
import { jsonParseErrorHandler } from "./middleware/jsonParseErrorHandler.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JSON Parse Error Handler (must be after body parsers)
app.use(jsonParseErrorHandler);

// Request Logging Middleware
app.use((req, res, next) => {
  logger.info(`Incoming ${req.method} request to ${req.url}`);
  next();
});

// Defined Routes
app.get("/", (req, res) => {
  res.send({
    message: "Transformation Module Backend is running",
    docs: "/api/v1",
  });
});

app.use("/api/v1", router);

// 404 Handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
  });
});


// --- Error Middleware (MUST BE LAST) ---
app.use(errorMiddleware);

// --- Server Startup ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(
    `Use POST request to http://localhost:${PORT}/api/v1/transform with your raw JSON in the body.`
  );
});


// --- Global Crash Handler Setup ---
process.on('uncaughtException', (err) => {
  // 1. Log the final crash details immediately.
  const crashLogEntry = logger._formatLog(
    "CRASH",
    "Process exiting due to Uncaught Exception!",
    { err }
  );

  console.error(JSON.stringify(crashLogEntry));
});


// Handle Unhandled Promise Rejections
process.on('unhandledRejection', (reason, promise) => {
  const rejectionLogEntry = logger._formatLog('REJECTION', 'Unhandled Promise Rejection!', { reason, promise });
  console.error(JSON.stringify(rejectionLogEntry));

  process.exit(1);
});
