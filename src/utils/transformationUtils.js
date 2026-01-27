import { toBoolean, isEmpty, resolveDeep } from "./util.js";
import logger from "../lib/logger.js";

export const sectionKeys = ["general", "letter_type_rule", "exception_json", "e2e_config_json", "metrics_config_rules", "assignment_rules"]

/**
 * Checks if a value is an advanced logic object (QueryBuilder configuration).
 */
export const isAdvancedLogic = (value) => {
    return (
        value &&
        typeof value === "object" &&
        value.type === "cascading-advanced"
    );
};

/**
 * Checks if a value is a unified field object (primaryValue + dependents).
 */
export const isUnifiedValue = (value) => {
    return (
        value &&
        typeof value === "object" &&
        "primaryValue" in value &&
        value.type !== "cascading-advanced"
    );
};

/**
 * Checks if a value is truthy (handles "true", "false", and objects).
 */
export const isTruthy = (value) => {
    if (isEmpty(value)) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true";
    }
    // If it's a unified value, check its primaryValue (though usually this function is called on the primaryValue itself)
    if (isUnifiedValue(value)) {
        return isTruthy(value.primaryValue);
    }
    return Boolean(value);
};

/**
 * Unpacks a unified value and processes its dependents if the primary value is truthy.
 */
export const processUnifiedValue = (fieldKey, unifiedObj, context, source, localTarget = null, options = {}) => {
    const { addToContext = true } = options;
    const { primaryValue, ...dependents } = unifiedObj;

    // 1. Add/Set the primaryValue for the parent field (as property name)
    // NEW: We store the ENTIRE unifiedObj in the context as a candidate for this key
    if (addToContext && context) {
        let contextObj = unifiedObj;

        // USER REQUIREMENT: If parent is falsy, set dependents to 'skip'
        if (!isTruthy(primaryValue)) {
            const skippedDependents = Object.fromEntries(
                Object.keys(dependents).map(k => [k, "skip"])
            );
            contextObj = { primaryValue, ...skippedDependents };
        }

        context.addCandidate(fieldKey, contextObj, source);
    }

    if (localTarget) {
        localTarget[fieldKey] = primaryValue;
    }

    const isWinnerTruthy = isTruthy(primaryValue);

    // 2. Process dependent fields locally (for the row)
    for (const [depKey, depValue] of Object.entries(dependents)) {
        let finalDepValue = isWinnerTruthy ? depValue : "skip";

        // Resolve variables in dependent values (e.g. var(read_code_date))
        if (localTarget) {
            if (isWinnerTruthy) {
                finalDepValue = resolveDeep(depValue, context?.originalInput || {}, localTarget, depKey, context);
            }
            localTarget[depKey] = finalDepValue;
            logger.info(`[${fieldKey}] Set dependent locally: ${depKey} = ${JSON.stringify(finalDepValue)}`);
        }
    }

    if (!localTarget && !context) {
        logger.warn(`[${fieldKey}] No context or localTarget provided to processUnifiedValue.`);
    }
};
/**
 * Checks if a value indicates the transformation should be killed.
 */
export const isKilled = (value) => {
    return value && typeof value === "object" && value.isKilled === true;
};

/**
 * Centrally handles result from any rule evaluation (Cascading Advanced, Unified, or Simple).
 * 1. Checks for Kill Signal
 * 2. Extracts recipient_notes
 * 3. Processes Matrix Assignments
 * 4. Processes the main Value (Unified or Simple)
 *
 * @returns {boolean} - Returns true if the transformation was killed.
 */
export const handleRuleResult = (fieldKey, result, context, source, localTarget = null, options = {}) => {
    const { addToContext = true } = options;
    // 1. Check Kill Signal
    if (isKilled(result)) {
        if (context) {
            context.setKilled({
                ...result,
                isKilled: true,
                field: fieldKey,
            });
        }
        return true;
    }

    // If result is null/undefined/simple, just add it and return
    if (result === null || typeof result !== "object") {
        if (addToContext && context) context.addCandidate(fieldKey, result, source);
        if (localTarget) localTarget[fieldKey] = result;
        return false;
    }

    // 2. Extract recipient_notes
    if (result.recipient_notes) {
        if (context) context.addNote(result.recipient_notes);
    }

    // 3. Handle Matrix Assignments
    if (result.matrixAssignments && typeof result.matrixAssignments === "object") {
        for (const [k, v] of Object.entries(result.matrixAssignments)) {
            if (isUnifiedValue(v)) {
                // For Matrix Assignments, we ALWAYS want them in the context
                processUnifiedValue(k, v, context, `matrix:${fieldKey}`, localTarget, { addToContext: true });
            } else {
                if (context) context.addCandidate(k, v, `matrix:${fieldKey}`);
                if (localTarget) localTarget[k] = v;
            }
        }
    }

    // 4. Process the main 'value' (Unified or Simple)
    // If it's a rich object (from Advanced Logic), use the 'value' property
    const finalValue = result.hasOwnProperty("value") ? result.value : result;

    if (isUnifiedValue(finalValue)) {
        processUnifiedValue(fieldKey, finalValue, context, source, localTarget, { addToContext });
    } else {
        if (addToContext && context) context.addCandidate(fieldKey, finalValue, source);
        if (localTarget) localTarget[fieldKey] = finalValue;
    }

    return false;
};
