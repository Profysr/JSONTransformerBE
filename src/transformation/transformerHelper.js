import logger from "../lib/logger.js";
import { processGeneric } from "./GenericEngine.js";

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

    try {
        // The Generic Engine handles all sections based on metadata
        const output = processGeneric(transformed, configRules);

        // Check for KILL
        if (output && output.isKilled) {
            logger.error(
                `[${output.field}] Transformation killed at field: ${output.field}, killValue: ${output.value}`
            );
            logger.info("Data transformation killed. Final state:", output.data);
            return { ...output, sectionKey };
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
