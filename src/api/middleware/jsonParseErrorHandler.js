import logger from "../../shared/logger.js";

/**
 * Middleware to catch JSON parsing errors from express.json()
 * Must be placed after express.json() middleware
 */
export const jsonParseErrorHandler = (err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        logger.error("Malformed JSON request", {
            path: req.path,
            method: req.method,
            error: err.message,
        });

        return res.status(400).json({
            success: false,
            message: "Invalid JSON in request body. Please check your syntax.",
        });
    }

    // Not a JSON parse error, pass to next error handler
    next(err);
};
