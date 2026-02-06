import logger from "../../../shared/logger.js";
import { resolveVariable } from "../../../shared/utils/generalUtils.js";
import { evaluateCascadingAdvanced } from "./EvaluateRule.js";
import { isAdvancedLogic } from "../utils/transformationUtils.js";

// ==================
// 1 Rule Dispatcher
// ==================
/** 
 * Orchestrates the application of rules based on type:
 * 1. Advanced Logic (Conditional)
 * 2. Variable Resolution
 * 3. Static Mapping
 */
export const applyRule = (inputData, fieldValue, fieldKey, localContext = {}, context = null, logPrefix = null) => {
    const prefix = logPrefix || `[${fieldKey}]`;

    // 1. Check for Advanced Logic
    if (isAdvancedLogic(fieldValue)) {
        const result = evaluateCascadingAdvanced(inputData, fieldValue, fieldKey, localContext, context, logPrefix);

        if (result.isKilled) {
            logger.warn(`${prefix} Rule triggered a termination (KILL). Resulting value: ${result.value}`);
            return result;
        }
        return result;
    }

    // 2. Check for Variables
    if (typeof fieldValue === "string" && fieldValue.includes("var(")) {
        return resolveVariable(fieldValue, inputData, localContext, fieldKey, context);
    }

    // 3. Static Assignment
    if (inputData.hasOwnProperty(fieldKey) && inputData[fieldKey] !== fieldValue) {
        logger.info(`${prefix} Overriding existing value "${inputData[fieldKey]}" with preferred static value: "${fieldValue}"`);
    }

    // 4. Fallback
    return fieldValue;
};
