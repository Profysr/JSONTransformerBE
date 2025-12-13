import express from "express";
import router from "./routes/index.js";
import logger from "./lib/logger.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
  logger.info(`Incoming ${req.method} request to ${req.url}`);
  next();
});

app.get("/", (req, res) => {
  res.send({
    message: "Transformation Module Backend is running",
    docs: "/api/v1",
  });
});

app.use("/api/v1", router);

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

  // 2. Production Mode: attempt to send buffered logs one last time
  if (logger.isProduction) {
    logger
      .flushHttp(process.env.API_ENDPOINT)
      .then(() => {
        console.error("Logger: Final best-effort flush completed before exit.");
        process.exit(1);
      })
      .catch(() => {
        console.error("Logger: Fatal error during final flush attempt.");
        process.exit(1);
      });
  } else {
    process.exit(1);
  }
});


// Handle Unhandled Promise Rejections
process.on('unhandledRejection', (reason, promise) => {
    const rejectionLogEntry = logger._formatLog('REJECTION', 'Unhandled Promise Rejection!', { reason, promise });
    console.error(JSON.stringify(rejectionLogEntry));
    
    process.exit(1); 
});
