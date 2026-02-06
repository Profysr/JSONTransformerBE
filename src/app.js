import express from "express";
import cors from "cors";
import router from "./api/routes/transformation.routes.js";
import logger from "./shared/logger.js";
import { errorMiddleware } from "./api/middleware/errorHandler.js";
import { jsonParseErrorHandler } from "./api/middleware/jsonParseErrorHandler.js";

// ==================
// 1 Initialize App
// ==================
const app = express();
const PORT = process.env.PORT;

// ==================
// 2 Middleware Stack
// ==================
app.use(cors({
  origin: "*", // adjust to specific domain(s) in production
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(jsonParseErrorHandler);

// ==================
// 3 Logging & Routes
// ==================
app.use((req, res, next) => {
  logger.info(`Incoming ${req.method} request to ${req.url}`);
  next();
});

app.get("/", (req, res) =>
  res.send({ message: "Transformation Module Backend is running", docs: "/api/v1" })
);
app.use("/api/v1", router);

// ==================
// 4 Error Handling
// ==================
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found` })
);

// Express error middleware must have 4 args
app.use((err, req, res, next) => {
  errorMiddleware(err, req, res, next);
});

// ==================
// 5 Server Startup
// ==================
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`POST http://localhost:${PORT}/api/v1/transform/<inst_id>/ with JSON`);
});

// ==================
// 6 Global Exception Handlers
// ==================
const logCrash = (type, err) => {
  console.error(`!!!! ${type} DETECTED !!!!`);
  console.error(err);

  try {
    logger.error(`Process exiting due to ${type}!`, {
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined
    });
  } catch (e) {
    console.error("Failed to log crash:", e.message);
  }

  if (type === "REJECTION" || type === "CRASH") {
    // Graceful shutdown before exit
    server.close(() => process.exit(1));
  }
};

process.on("uncaughtException", (err) => logCrash("CRASH", err));
process.on("unhandledRejection", (reason) => logCrash("REJECTION", reason));

// Handle termination signals
const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down...`);
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
