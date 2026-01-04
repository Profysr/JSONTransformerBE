import logger from "../lib/logger.js";
import { applyRule } from "./ruleApplier.js";

// There will be 2 kinda values -- object or a string.  if object, then there will be possibility of kill
export const processGeneralRules = (inputData, rules) => {
    for (const [fieldKey, fieldValue] of Object.entries(rules)) {
        const derivedValue = applyRule(inputData, fieldValue, fieldKey);

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
                inputData: inputData,
            };
        }

        inputData[fieldKey] = derivedValue;
        logger.info(`[${fieldKey}] Successfully mapped to: ${derivedValue}`);
    }

    return inputData;
}
