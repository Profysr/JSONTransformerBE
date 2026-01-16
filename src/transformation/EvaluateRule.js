import logger from "../lib/logger.js";
import { evaluateCondition } from "../lib/evaluateConditions.js";
import { isEmpty } from "../utils/util.js";

/** This is the first child that takes the rules, logicType and pass it to the next function for evaluation */
export const evaluateRuleList = (inputData, rules, logicType, fieldKey, localContext = {}) => {
    // Validate rules array
    if (!rules || !Array.isArray(rules) || rules.length === 0) {
        logger.error(`[${fieldKey}] Invalid or empty rules array`);
        return false;
    }

    const result =
        logicType === "OR"
            ? rules.some((rule) => evaluateRuleRecursive(inputData, rule, fieldKey, localContext))
            : rules.every((rule) => evaluateRuleRecursive(inputData, rule, fieldKey, localContext));

    return result;
};

export const evaluateRuleRecursive = (inputData, rule, fieldKey, localContext = {}) => {
    /** Running a recusrive function on the group. You can think of it as, 
     * a AND b AND (c OR D)
     * Here (c OR D) is a group, so we run a recusrive function on it
     */
    if (rule.type === "group") {
        logger.info(`[${fieldKey}] Evaluating Group (Logic: ${rule.logicType})`);

        if (!rule.rules || !Array.isArray(rule.rules)) {
            logger.error(`[${fieldKey}] Group rule missing 'rules' array`);
            return false;
        }

        return evaluateRuleList(inputData, rule.rules, rule.logicType, fieldKey, localContext);
    }

    // Single condition evaluation
    const result = evaluateCondition(inputData, rule, fieldKey, localContext);
    return result;
};

/**
 * Main function, that takes the input inputData, configconditions for the field, and pass it to their child functions
 */
export const evaluateCascadingAdvanced = (inputData, fieldValue, fieldKey, localContext = {}) => {
    for (const [index, clause] of fieldValue.clauses.entries()) {
        if (!clause || typeof clause !== "object") {
            logger.warn(`[${fieldKey}] Clause ${index + 1} is invalid, skipping`);
            continue;
        }

        logger.info(
            `[${fieldKey}] Evaluating Clause ${index + 1} (RootLogic: ${clause.rootLogicType || "AND"
            })`
        );

        const result = evaluateRuleList(
            inputData,
            clause.rules,
            clause.rootLogicType || "AND",
            fieldKey,
            localContext
        );

        /** if condition satisfied, return thenValue */
        if (result) {
            const outcome = clause.outcome || {};
            const isKilled = outcome.isKilled === true;
            logger.info(
                `[${fieldKey}] Condition satisfied at Clause ${index + 1}. isKilled: ${isKilled}`
            );
            return {
                ...outcome, // Return full object (value, notes, batch_name, etc.)
                fieldKey,
                isKilled,
            };
        } else {
            logger.info(
                `[${fieldKey}] Condition not satisfied at Clause ${index + 1}`
            );
        }
    }

    /** if there's no condition match, simply extract the elseVal from fieldValue and return it */
    const elseBlock = fieldValue.else || {};
    const isKilled = elseBlock.isKilled === true;
    const elseValue = !isEmpty(elseBlock.value) ? elseBlock.value : "";

    logger.info(
        `[${fieldKey}] No condition satisfied, using elseValue: ${elseValue}, isKilled: ${isKilled}`
    );

    return {
        ...elseBlock,
        value: elseValue,
        isKilled: isKilled,
    };
};
