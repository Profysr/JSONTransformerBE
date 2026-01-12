import logger from "../lib/logger.js";
import { processMetrics } from "./handlers/metricsHandler.js";
import { processReadCodes } from "./handlers/readCodesHandler.js";
import { processGeneralRules } from "./generalProcessor.js";

/**
 * Helper function to check if transformation should be killed ✅
 */
export const checkForKill = (result, sectionKey) => {
    if (result && result.isKilled) {
        logger.error(
            `[${result.field}] Transformation killed at field: ${result.field}, killValue: ${result.value}`
        );
        logger.info("Data transformation killed. Final state:", result.data);
        return { ...result, sectionKey };
    }
    return null;
};

/**
 * Transforms the input data based on the defined rules in configuration. ✅
 */
export const transformerHelper = (inputData, configRules) => {
    const startTime = Date.now();
    let transformed = { ...inputData };
    logger.info("Started JSON Transformation");
    logger.info(
        `Configuration has ${Object.keys(configRules).length} sections`
    );

    for (const [sectionKey, sectionRules] of Object.entries(configRules)) {
        logger.info(`[Section: ${sectionKey}] Started processing...`);

        if (!sectionRules || typeof sectionRules !== "object") {
            logger.error(`[Section: ${sectionKey}] Invalid section rules object`);
            return inputData;
        }

        try {
            let result;

            // Dispatch to explicit handlers
            if (sectionKey === "metrics") {
                result = processMetrics(transformed, sectionRules);
            } else if (sectionKey === "readCodes") {
                result = processReadCodes(transformed, sectionRules);
            } else {
                // Default behavior for other sections
                result = processGeneralRules(transformed, sectionRules);
            }

            const killCheck = checkForKill(result, sectionKey);
            if (killCheck) return killCheck;

            transformed = result;
        } catch (error) {
            /** Stop the execution */
            logger.error(`[Section: ${sectionKey}] Error processing section:`, {
                error: error.message,
                stack: error.stack,
            });
            throw new Error(`[Section: ${sectionKey}] Error processing section: ${error.message}`);
        }
    }

    const totalDuration = Date.now() - startTime;
    logger.info(
        `Data transformation completed successfully in ${totalDuration}ms`
    );
    logger.info("Final transformed data:", transformed);
    return transformed;
};
