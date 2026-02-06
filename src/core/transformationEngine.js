import logger from "../shared/logger.js";
import { processMetrics } from "./transformation/handlers/metrics.handler.js";
import { processReadCodes } from "./transformation/handlers/readCodes.handler.js";
import { processGeneralRules } from "./transformation/handlers/general.processor.js";
import { TransformationContext } from "./transformation/context/TransformationContext.js";
import { ErrorHandler } from "../api/middleware/errorHandler.js";
import { sectionKeys } from "./transformation/utils/transformationUtils.js";

// ==================
// 1 Initialization
// ==================
export const transformationEngine = (inputData, configRules) => {
    const startTime = Date.now();
    logger.info(`Starting transformation process. Identified ${Object.keys(configRules).length} configuration sections to process.`);

    const context = new TransformationContext(inputData);

    // ==================
    // 2 Section Processing
    // ==================
    for (const [sectionKey, sectionRules] of Object.entries(configRules)) {
        if (context.killResult) break;

        logger.info(`[Section: ${sectionKey}] Beginning evaluation...`);

        if (!sectionRules || typeof sectionRules !== "object") {
            return new ErrorHandler(400, `[Section: ${sectionKey}] Configuration is invalid or missing.`);
        }

        let sectionType = sectionKey;
        if (sectionRules.sectionKey) {
            sectionType = sectionRules.sectionKey;
        }

        // Dispatch based on section type
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

    // ==================
    // 3 Final Output Resolution
    // ==================
    const finalOutput = context.getFinalOutput();
    const candidates = context._viewCandidates(true);
    const totalDuration = Date.now() - startTime;
    logger.info(`Transformation lifecycle finished successfully in ${totalDuration}ms.`);
    logger.info(`Candidates: (only for debugging)`, candidates);
    return finalOutput;
};
