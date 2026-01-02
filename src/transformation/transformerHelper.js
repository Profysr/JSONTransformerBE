import logger from "../lib/logger.js";
import { processMetricsRules } from "./metricsProcessor.js";
import { processReadCodesRules } from "./readCodesProcessor.js";
import { processGeneralRules } from "./generalProcessor.js";

/**
 * Transforms the input data based on the defined rules in configuration.
 */
export const transformerHelper = (input, configRules) => {
    const startTime = Date.now();
        // Validation
        if (!input || typeof input !== "object") {
            logger.error("transformerHelper: Invalid input data");
            throw new Error("Invalid input data provided");
        }

        if (!configRules || typeof configRules !== "object") {
            logger.error("transformerHelper: Invalid configuration rules");
            throw new Error("Invalid configuration rules provided");
        }

        let transformed = { ...input };
        logger.info("Started JSON Transformation");
        logger.info(
            `Configuration has ${Object.keys(configRules).length} sections`
        );

        for (const [sectionKey, sectionRules] of Object.entries(configRules)) {
            logger.info(`[Section: ${sectionKey}] Starting processing...`);

            try {
                let result;

                // 1. Process Metrics
                if (sectionKey === "metrics") {
                    result = processMetricsRules(transformed, sectionRules);

                    if (result && result.isKilled) {
                        logger.error(
                            `[${result.field}] Transformation killed at metrics field: ${result.field}, killValue: ${result.value}`
                        );
                        logger.info("Data transformation killed. Final state:", result.data);
                        return { ...result, sectionKey };
                    }
                    transformed = result;
                }
                // 2. Process ReadCodes & OptionalCodes
                else if (sectionKey === "readCodes" || sectionKey === "optionalCodes") {
                    result = processReadCodesRules(transformed, sectionRules);

                    if (result && result.isKilled) {
                        logger.error(
                            `[${result.field}] Transformation killed at readcode field: ${result.field}, killValue: ${result.value}`
                        );
                        logger.info("Data transformation killed. Final state:", result.data);
                        return { ...result, sectionKey };
                    }
                    transformed = result;
                }
                // 3. Default behavior for other sections
                else if (
                    typeof sectionRules === "object" &&
                    !Array.isArray(sectionRules) &&
                    sectionRules !== null
                ) {
                    result = processGeneralRules(transformed, sectionRules);

                    if (result && result.isKilled) {
                        logger.error(
                            `[${result.field}] Transformation killed at field: ${result.field}, killValue: ${result.value}`
                        );
                        logger.info("Data transformation killed. Final state:", result.data);
                        return { ...result, sectionKey };
                    }
                    transformed = result;
                } else {
                    logger.warn(
                        `[Section: ${sectionKey}] Invalid section rules, skipping`
                    );
                }
            } catch (error) {
                logger.error(`[Section: ${sectionKey}] Error processing section:`, {
                    error: error.message,
                    stack: error.stack,
                });
                // Continue processing other sections
            }
        }

        const totalDuration = Date.now() - startTime;
        logger.info(
            `Data transformation completed successfully in ${totalDuration}ms`
        );
        logger.info("Final transformed data:", transformed);
        return transformed;
};
