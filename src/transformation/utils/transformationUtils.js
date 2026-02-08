import logger from "../../shared/logger.js";
import { isEmpty, resolveDeep } from "../../shared/utils/generalUtils.js";

// ==================
// 1 Configuration Constants
// ==================
export const sectionKeys = ["general", "letter_type_rule", "exception_json", "e2e_config_json", "metrics_config_rules", "assignment_rules"];

// ==================
// 2 Type Checker Helpers
// ==================
/**
 * Checks if a value is an advanced logic object
 */
export const isAdvancedLogic = (value) => {
    return (
        value &&
        typeof value === "object" &&
        value.type === "cascading-advanced"
    );
};

/**
 * Checks if a value is a unified field object
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
 * Checks if a value is truthy
 */
export const isTruthy = (value) => {
    if (isEmpty(value)) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true";
    }
    if (isUnifiedValue(value)) {
        return isTruthy(value.primaryValue);
    }
    return Boolean(value);
};

/**
 * Checks if a value indicates the transformation should be killed.
 */
export const isKilled = (value) => {
    return value && typeof value === "object" && value.isKilled === true;
};

// ==================
// 3 Unified Value Processing
// ==================

export const processUnifiedValue = (fieldKey, unifiedObj, context, localTarget = null, options = {}, sectionKey = "") => {
    const { addToContext = true } = options;
    const { primaryValue, ...dependents } = unifiedObj;

    // 1- Add to context
    if (addToContext && context) {
        let contextObj = unifiedObj;

        if (!isTruthy(primaryValue)) {
            const skippedDependents = Object.fromEntries(
                Object.keys(dependents).map(k => [k, "skip"])
            );
            contextObj = { primaryValue, ...skippedDependents };
        }

        context.addCandidate(fieldKey, contextObj, sectionKey);
    }

    if (localTarget) {
        localTarget[fieldKey] = primaryValue;
    }

    // 2- Prepare it for the local context. Will be mostly used in rows and resolve values.
    const isWinnerTruthy = isTruthy(primaryValue);

    for (const [depKey, depValue] of Object.entries(dependents)) {
        let finalDepValue = isWinnerTruthy ? depValue : "skip";

        if (localTarget) {
            if (isWinnerTruthy) {
                finalDepValue = resolveDeep(depValue, context?.originalInput || {}, localTarget, depKey, context, sectionKey, depKey);
            }
            localTarget[depKey] = finalDepValue;
            logger.info(
                `Mapped related field: ${depKey} = ${JSON.stringify(finalDepValue)}`,
                { sectionKey, functionName: "processUnifiedValue", fieldKey }
            );
        }
    }
};

// ==================
// 4 Rule Result Orchestration
// ==================

export const handleRuleResult = (fieldKey, result, context, localTarget = null, options = {}, sectionKey = "") => {
    const { addToContext = true } = options;

    // 1. Check Kill Signal
    if (isKilled(result)) {
        if (context) {
            context.setKilled({
                ...result,
                isKilled: true,
                field: fieldKey,
            }, sectionKey, fieldKey);
        }
        return true;
    }

    // 2. Simple Values
    if (result === null || typeof result !== "object") {
        if (addToContext && context) context.addCandidate(fieldKey, result, sectionKey);
        if (localTarget) localTarget[fieldKey] = result;
        return false;
    }

    // 3. Extract recipient_notes
    if (result.recipient_notes) {
        if (context) context.addNote(result.recipient_notes);
    }

    // 4. Handle Matrix Assignments
    if (result.matrixAssignments && typeof result.matrixAssignments === "object") {
        for (const [k, v] of Object.entries(result.matrixAssignments)) {
            if (isUnifiedValue(v)) {
                processUnifiedValue(k, v, context, localTarget, { addToContext: true }, sectionKey);
            } else {
                if (context) context.addCandidate(k, v, sectionKey);
                if (localTarget) localTarget[k] = v;
            }
        }
    }

    // 5. Process the main 'value'
    const finalValue = result.hasOwnProperty("value") ? result.value : result;

    if (isUnifiedValue(finalValue)) {
        processUnifiedValue(fieldKey, finalValue, context, localTarget, { addToContext }, sectionKey);
    } else {
        if (addToContext && context) context.addCandidate(fieldKey, finalValue, sectionKey);
        if (localTarget) localTarget[fieldKey] = finalValue;
    }

    return false;
};
