import logger from "../lib/logger.js";
import { processMetrics } from "./handlers/metricsHandler.js";
import { processReadCodes } from "./handlers/readCodesHandler.js";
import { processGeneralRules } from "./handlers/generalProcessor.js";
import { TransformationContext } from "./TransformationContext.js";

export const transformerHelper = (inputData, configRules) => {
    const startTime = Date.now();
    logger.info(`Configuration has ${Object.keys(configRules).length} sections. Started JSON Transformation`);

    // 1. Initialize Context with immutable input
    const context = new TransformationContext(inputData);

    for (const [sectionKey, sectionRules] of Object.entries(configRules)) {
        if (context.killResult) break; // Check global kill

        logger.info(`[Section: ${sectionKey}] Started Processing...`);

        if (!sectionRules || typeof sectionRules !== "object") {
            throw new Error(`[Section: ${sectionKey}] Configuration is invalid or missing.`);
        }

        if (sectionKey === "metrics") {
            processMetrics(inputData, sectionRules, context);
        } else if (sectionKey === "readCodes") {
            processReadCodes(inputData, sectionRules, context);
        } else {
            processGeneralRules(inputData, sectionRules, context);
        }

        if (context.killResult) {
            logger.warn(`Transformation aborted by kill signal.`);
            break;
        }
    }

    // 2. Resolve Final Output
    const finalOutput = context.getFinalOutput();
    const output = { ...inputData, ...finalOutput };

    const totalDuration = Date.now() - startTime;
    logger.info(`Data transformation completed successfully in ${totalDuration}ms`);

    return output;
};
