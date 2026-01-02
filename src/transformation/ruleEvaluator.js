import logger from "../lib/logger.js";
import { evaluateCondition } from "../lib/evaluateConditions.js";

/**
 * Helper to evaluate a list of rules based on logic type (AND/OR).
 * @param {Object} data - Input data to evaluate against
 * @param {Array} rules - Array of rules to evaluate
 * @param {String} logicType - "AND" or "OR"
 * @param {String} fieldKey - Field identifier for logging
 * @returns {Boolean} - Result of evaluation
 */
export const evaluateRuleList = (data, rules, logicType, fieldKey) => {
    try {
        // Validation
        if (!rules || !Array.isArray(rules) || rules.length === 0) {
            logger.error(`[${fieldKey}] No rules found or invalid rules array`);
            return false;
        }

        if (!data || typeof data !== "object") {
            logger.error(`[${fieldKey}] Invalid data object provided for evaluation`);
            return false;
        }

        logger.info(`[${fieldKey}] Evaluating ${rules.length} rules with ${logicType} logic`);

        const result =
            logicType === "OR"
                ? rules.some((rule) => evaluateRuleRecursive(data, rule, fieldKey))
                : rules.every((rule) => evaluateRuleRecursive(data, rule, fieldKey));

        logger.info(`[${fieldKey}] Rule list evaluation result: ${result}`);
        return result;
    } catch (error) {
        logger.error(`[${fieldKey}] Error in evaluateRuleList:`, {
            error: error.message,
            stack: error.stack,
        });
        return false;
    }
};

/**
 * Recursive function to evaluate a single rule or a group of rules.
 * @param {Object} data - Input data to evaluate against
 * @param {Object} rule - Rule object to evaluate
 * @param {String} fieldKey - Field identifier for logging
 * @returns {Boolean} - Result of evaluation
 */
export const evaluateRuleRecursive = (data, rule, fieldKey) => {
    try {
        // Validation
        if (!rule || typeof rule !== "object") {
            logger.error(`[${fieldKey}] Invalid rule object provided`);
            return false;
        }

        if (rule.type === "group") {
            logger.info(`[${fieldKey}] Evaluating Group (Logic: ${rule.logicType})`);

            if (!rule.rules || !Array.isArray(rule.rules)) {
                logger.error(`[${fieldKey}] Group rule missing 'rules' array`);
                return false;
            }

            return evaluateRuleList(data, rule.rules, rule.logicType, fieldKey);
        }

        // Single condition evaluation
        const result = evaluateCondition(data, rule, fieldKey);
        return result;
    } catch (error) {
        logger.error(`[${fieldKey}] Error in evaluateRuleRecursive:`, {
            error: error.message,
            stack: error.stack,
        });
        return false;
    }
};

/**
 * Evaluates a single cascading-advanced condition
 * @param {Object} data - Input data to evaluate against
 * @param {Object} config - Cascading-advanced configuration
 * @param {String} fieldKey - Field identifier for logging
 * @returns {Object} - { value, isKilled }
 */
export const evaluateCascadingAdvanced = (data, config, fieldKey) => {
    try {
        // Validation
        if (!config || typeof config !== "object") {
            logger.error(`[${fieldKey}] Invalid cascading-advanced config`);
            return { value: undefined, isKilled: false };
        }

        if (!config.clauses || !Array.isArray(config.clauses)) {
            logger.error(`[${fieldKey}] Cascading-advanced config missing 'clauses' array`);
            return { value: config.else?.value, isKilled: config.else?.isKilled || false };
        }

        logger.info(`[${fieldKey}] Evaluating ${config.clauses.length} cascading clauses`);

        for (const [index, clause] of config.clauses.entries()) {
            if (!clause || typeof clause !== "object") {
                logger.warn(`[${fieldKey}] Clause ${index + 1} is invalid, skipping`);
                continue;
            }

            logger.info(
                `[${fieldKey}] Evaluating Clause ${index + 1} (RootLogic: ${clause.rootLogicType || "AND"
                })`
            );

            const rulesMatch = evaluateRuleList(
                data,
                clause.rules,
                clause.rootLogicType || "AND",
                fieldKey
            );

            /** if condition satisfied, return thenValue */
            if (rulesMatch) {
                const isKilled = clause.outcome?.isKilled === true;
                logger.info(
                    `[${fieldKey}] Condition satisfied at Clause ${index + 1}. Value: ${clause.outcome?.value
                    }, isKilled: ${isKilled}`
                );
                return {
                    value: clause.outcome?.value,
                    isKilled,
                };
            } else {
                logger.info(
                    `[${fieldKey}] Condition not satisfied at Clause ${index + 1}`
                );
            }
        }

        /** if there's no condition match, simply extract the elseVal from config and return it */
        const isKilled = config.else?.isKilled === true;
        logger.info(
            `[${fieldKey}] No condition satisfied, using elseValue: ${config.else?.value}, isKilled: ${isKilled}`
        );
        return {
            value: config.else?.value,
            isKilled: isKilled,
        };
    } catch (error) {
        logger.error(`[${fieldKey}] Error in evaluateCascadingAdvanced:`, {
            error: error.message,
            stack: error.stack,
        });
        return { value: undefined, isKilled: false };
    }
};
