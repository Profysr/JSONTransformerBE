import logger from "../lib/logger.js";
import { processGeneric } from "./GenericEngine.js";

/**
 * Helper function to check if transformation should be killed
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
 * Transforms the input data based on the defined rules in configuration.
 * Uses the Metadata-Driven Generic Engine.
 */
export const transformerHelper = (inputData, configRules) => {
    const startTime = Date.now();
    let transformed = { ...inputData };
    logger.info("Started JSON Transformation");
    logger.info(
        `Configuration has ${Object.keys(configRules).length} sections`
    );

    try {
        // The Generic Engine handles all sections based on metadata
        const output = processGeneric(transformed, configRules);

        // Check for KILL
        if (output && output.isKilled) {
            const killCheck = checkForKill(output, output.sectionKey || "Unknown");
            if (killCheck) return killCheck;
        }

        // Merge output into transformed data
        transformed = { ...transformed, ...output };

    } catch (error) {
        /** Stop the execution */
        logger.error(`Transformation Error:`, {
            error: error.message,
            stack: error.stack,
        });
        throw new Error(`Transformation Error: ${error.message}`);
    }

    const totalDuration = Date.now() - startTime;
    logger.info(
        `Data transformation completed successfully in ${totalDuration}ms`
    );
    logger.info("Final transformed data:", transformed);
    return transformed;
};
