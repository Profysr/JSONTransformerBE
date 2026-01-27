import logger from "../../lib/logger.js";
import { resolveVariable } from "../../utils/util.js";
import { evaluateCascadingAdvanced } from "./EvaluateRule.js";

/** 
 * There are 4 types of rules:
 * 1. Static assignment
 * 2. Static assignment with variable
 * 3. Variable mapping
 * 4. Advanced logic
 */
export const applyRule = (inputData, fieldValue, fieldKey, localContext = {}, context = null) => {

    // 1. Check if the fieldValue is configured through advanced logic
    if (
        typeof fieldValue === "object" &&
        fieldValue !== null &&
        fieldValue.type === "cascading-advanced"
    ) {
        const result = evaluateCascadingAdvanced(inputData, fieldValue, fieldKey, localContext, context);

        if (result.isKilled) {
            logger.warn(`[${fieldKey}] Rule resulted in KILL. Value: ${result.value}`);
            return result;
        }
        return result;
    }

    // 2. Check if the fieldValue is a variable
    if (typeof fieldValue === "string" && fieldValue.includes("var(")) {
        return resolveVariable(fieldValue, inputData, localContext, fieldKey, context);
    }

    // 3. Static assignment for Field
    if (inputData.hasOwnProperty(fieldKey) && inputData[fieldKey] !== fieldValue) {
        logger.info(`[${fieldKey}] Found property in JSON and over-riding it with new value: "${inputData[fieldKey]}" -> "${fieldValue}"`);
    }

    // 4. no property found. Just pass field with its value
    return fieldValue;
};
