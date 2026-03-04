import { ErrorHandler } from "./errorHandler.js";

export const validateRequiredKeys = (requiredKeys = []) => {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== "object") {
      return next(
        new ErrorHandler(400, "Request body must be a valid JSON object.")
      );
    }

    const missingKeys = requiredKeys.filter(
      (key) => req.body[key] === undefined
    );

    if (missingKeys.length > 0) {
      return next(
        new ErrorHandler(
          400,
          `Missing required root field(s): ${missingKeys.join(", ")}`
        )
      );
    }

    next();
  };
};