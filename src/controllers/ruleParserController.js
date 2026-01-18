import { parseConfiguration } from "../utils/ruleParser.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import catchAsyncHandler from "../middleware/catchAsyncHandler.js";

/**
 * Controller to parse rules from JSON into human-readable format.
 * Expects the body to contain { config: [...] } or just [...]
 */
export const parseRules = catchAsyncHandler(async (req, res, next) => {
    let config = req.body.config;

    if (!config && Array.isArray(req.body)) {
        config = req.body;
    }

    if (!config) {
        return next(new ErrorHandler(400, "Invalid request. 'config' array is required."));
    }

    try {
        const options = {
            includeInactive: req.body.includeInactive === true
        };
        const parsedResult = parseConfiguration(config, options);

        res.status(200).json({
            success: true,
            sections: parsedResult
        });
    } catch (error) {
        return next(new ErrorHandler(500, `Failed to parse rules: ${error.message}`));
    }
});
