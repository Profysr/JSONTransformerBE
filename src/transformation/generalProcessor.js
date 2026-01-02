import logger from "../lib/logger.js";
import { applyRule } from "./ruleApplier.js";

export const processGeneralRules = (data, rules) => {
    if (!rules || typeof rules !== "object") {
        logger.error("processGeneralRules: Invalid rules object");
        return data;
    }

    const fieldCount = Object.keys(rules).length;
    logger.info(`Processing ${fieldCount} general field rules`);

    for (const [fieldKey, fieldValue] of Object.entries(rules)) {
        try {
            logger.info(`[${fieldKey}] Processing field...`);
            const derivedValue = applyRule(data, fieldValue, fieldKey);

            // Check for kill scenario
            if (
                typeof derivedValue === "object" &&
                derivedValue !== null &&
                derivedValue.isKilled === true
            ) {
                logger.error(
                    `[${fieldKey}] Field triggered KILL. Value: ${derivedValue.value}`
                );
                return {
                    isKilled: true,
                    field: fieldKey,
                    value: derivedValue.value,
                    data: data,
                };
            }

            data[fieldKey] = derivedValue;
            logger.info(`[${fieldKey}] Successfully set to: ${derivedValue}`);
        } catch (error) {
            logger.error(`[${fieldKey}] Error processing field:`, {
                error: error.message,
                stack: error.stack,
            });
            // Continue processing other fields even if one fails
        }
    }

    logger.info(`Completed processing ${fieldCount} general field rules`);
    return data;
}
