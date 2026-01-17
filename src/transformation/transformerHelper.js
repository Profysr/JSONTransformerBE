import logger from "../lib/logger.js";
import { processMetrics } from "./handlers/metricsHandler.js";
import { processReadCodes } from "./handlers/readCodesHandler.js";
import { processGeneralRules } from "./generalProcessor.js";
import { TransformationContext } from "./TransformationContext.js";
import { cleanDeep } from "../utils/util.js";

export const transformerHelper = (inputData, configRules) => {
    const startTime = Date.now();
    logger.info("Started JSON Transformation");
    logger.info(`Configuration has ${Object.keys(configRules).length} sections`);

    // 1. Initialize Context with immutable input
    const context = new TransformationContext(inputData);

    for (const [sectionKey, sectionRules] of Object.entries(configRules)) {
        if (context.killResult) break; // Check global kill

        logger.info(`[Section: ${sectionKey}] Started processing...`);

        if (!sectionRules || typeof sectionRules !== "object") {
            logger.error(`[Section: ${sectionKey}] Invalid section rules object`);
        }

        try {
            // Dispatch to explicit handlers with CONTEXT
            if (sectionKey === "metrics") {
                processMetrics(inputData, sectionRules, context);
            } else if (sectionKey === "readCodes") {
                processReadCodes(inputData, sectionRules, context);
            } else {
                // Default behavior for other sections
                processGeneralRules(inputData, sectionRules, context);
            }

            if (context.killResult) {
                logger.warn(`Transformation aborted by kill signal.`);
                break;
            }

        } catch (error) {
            /** Stop the execution */
            logger.error(`[Section: ${sectionKey}] Error processing section:`, {
                error: error.message,
                stack: error.stack,
            });
        }
    }

    // 2. Resolve Final Output
    const finalOutput = context.getFinalOutput();
    const mergedOutput = { ...inputData, ...finalOutput };
    const totalDuration = Date.now() - startTime;
    logger.info(`Data transformation completed successfully in ${totalDuration}ms`);

    return cleanDeep(mergedOutput);
};
