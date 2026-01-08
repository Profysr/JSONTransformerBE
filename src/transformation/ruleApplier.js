import logger from "../lib/logger.js";
import { evaluateCascadingAdvanced } from "./ruleEvaluator.js";
import { resolveVariable } from "../utils/utils.js";

/** 
 * There are 4 types of rules:
 * 1. Static assignment - For example: search for a property and it isn't present, then just add it such as if I set batch_name = "Practice to Review"
 * 2. Static assignment with variable - For example: search for a property and it is present in our input, then map it. such as if I set hospital_name = NHS 111.
 * 3. Variable mapping
 * 4. Advanced logic
*/
export const applyRule = (inputData, fieldValue, fieldKey, localContext = {}) => {

    // 1. Check if the fieldValue is configured through advanced logic
    if (
        typeof fieldValue === "object" &&
        fieldValue !== null &&
        fieldValue.type === "cascading-advanced"
    ) {
        const result = evaluateCascadingAdvanced(inputData, fieldValue, fieldKey, localContext);

        if (result.isKilled) {
            logger.warn(`[${fieldKey}] Rule resulted in KILL. Value: ${result.value}`);
            return { value: result.value, isKilled: true };
        }

        fieldValue = result.value;
    }

    // 2. Check if the fieldValue is a variable
    if (typeof fieldValue === "string" && fieldValue.includes("var(")) {
        return resolveVariable(fieldValue, inputData, localContext, fieldKey);
    }

    // 3. Static assignment for Field
    if (inputData.hasOwnProperty(fieldKey) && inputData[fieldKey] !== fieldValue) {
        logger.info(`[${fieldKey}] Found property in JSON and over-riding it with new value: "${inputData[fieldKey]}" -> "${fieldValue}"`);
    }

    // 4. no property found. Just pass field with its value
    return fieldValue;
};
