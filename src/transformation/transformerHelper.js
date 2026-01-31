import logger from "../lib/logger.js";
import { processMetrics } from "./handlers/metricsHandler.js";
import { processReadCodes } from "./handlers/readCodesHandler.js";
import { processGeneralRules } from "./handlers/generalProcessor.js";
import { TransformationContext } from "./TransformationContext.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { sectionKeys } from "../utils/transformationUtils.js";

export const transformerHelper = (inputData, configRules) => {
    const startTime = Date.now();
    logger.info(`Configuration has ${Object.keys(configRules).length} sections. Started JSON Transformation`);

    // 1. Initialize Context with immutable input
    const context = new TransformationContext(inputData);

    for (const [sectionKey, sectionRules] of Object.entries(configRules)) {
        if (context.killResult) break; // Check global kill

        logger.info(`[Section: ${sectionKey}] Started Processing...`);

        if (!sectionRules || typeof sectionRules !== "object") {
            return new ErrorHandler(400, `[Section: ${sectionKey}] Configuration is invalid or missing.`);
        }

        // Identify section type based on key or internal sectionKey property
        let sectionType = sectionKey;
        if (sectionRules.sectionKey) {
            sectionType = sectionRules.sectionKey;
        }

        // Use frontend-defined sectionKeys for validation and dispatch
        if (sectionType === "metrics_config_rules") {
            processMetrics(inputData, sectionRules, context);
        } else if (sectionType === "e2e_config_json") {
            processReadCodes(inputData, sectionRules, context);
        } else if (sectionKeys.includes(sectionType)) {
            processGeneralRules(inputData, sectionRules, context);
        } else {
            logger.warn(`[Section: ${sectionKey}] Unknown section type/key. Skipping to prevent data leakage.`);
            return new ErrorHandler(400, `[Section: ${sectionKey}] Invalid Configuration. Section is not recognized.`);
        }

        if (context.killResult) {
            logger.warn(`Transformation aborted by kill signal.`);
            break;
        }
    }

    // 2. Resolve Final Output
    const finalOutput = context.getFinalOutput();
    const candidates = context._viewCandidates(true);
    const totalDuration = Date.now() - startTime;
    logger.info(`Data transformation completed successfully in ${totalDuration}ms`);
    logger.info(`Candidates: (only for debugging)`, candidates);
    return finalOutput;
};
