import logger from "../../shared/logger.js";

export class ErrorHandler extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Handle specific error types
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    // JSON parse error - handled by jsonParseErrorHandler, but as fallback
    statusCode = 400;
    message = "Invalid JSON in request body. Please check your syntax.";
  } else if (err.name === "ValidationError") {
    // Validation errors
    statusCode = 400;
    message = err.message || "Validation failed. Please check your input.";
  } else if (err.name === "TypeError" || err.name === "ReferenceError") {
    // Null pointer exceptions and reference errors
    statusCode = 500;
    message = "An internal error occurred while processing your request.";
    logger.error("Type/Reference Error:", { error: err.message, stack: err.stack });
  } else if (!(err instanceof ErrorHandler)) {
    // Convert unknown errors to ErrorHandler
    logger.error("Unhandled Error:", { error: err.message, stack: err.stack });
  }

  // Log the error before sending response
  logger.info(`[${statusCode}] Returning Error Response: ${message}`, {
    path: req.path,
    method: req.method,
  });

  // Ensure we always return JSON, not HTML
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json({
    success: false,
    message: message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }) // Include stack in dev for easier debugging
  });
};
