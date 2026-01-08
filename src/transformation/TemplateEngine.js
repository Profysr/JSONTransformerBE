import { TransformFunctions } from "../utils/TransformFunctions.js";
import logger from "../lib/logger.js";
import { evaluateCondition as evaluateSingleCondition } from "../lib/evaluateConditions.js";

/**
 * Helper: Recursively evaluate conditions (logical groups or operator rules) ✅
 */
const evaluateCondition = (condition, context, ruleKey = "Global") => {
    if (!condition) return true;

    // 1. Handle Array (Default AND logic)
    if (Array.isArray(condition)) {
        return condition.every(c => evaluateCondition(c, context, ruleKey));
    }

    const type = typeof condition;

    // 2. Handle String Expressions (e.g., "code_type === 'diagnosis'")
    if (type === "string") {
        try {
            // Provide 'context' and 'ctx' as aliases for the context object
            const func = new Function("context", "ctx", `with(context) { return ${condition}; }`);
            return func(context, context);
        } catch (error) {
            logger.warn(`[TemplateEngine][${ruleKey}] Condition evaluation failed: "${condition}". Error: ${error.message}`);
            return false;
        }
    }

    // 3. Handle Object Conditions
    if (type === "object" && condition !== null) {
        const { logic, rules, field, operator } = condition;

        // Case A: Logical Group { logic: "OR"|"AND", rules: [...] }
        if (logic) {
            const list = rules || [];
            return logic === "OR"
                ? list.some(r => evaluateCondition(r, context, ruleKey))
                : list.every(r => evaluateCondition(r, context, ruleKey));
        }

        // Case B: Operator Rule { field: "...", operator: "...", value: "..." }
        if (field && operator) {
            return evaluateSingleCondition(context, condition, ruleKey, context);
        }
    }

    return false;
};

/**
 * Internal Helper: Apply one or more transformation functions to a value ✅
 */
const applyTransforms = (value, transforms, context) => {
    const transformList = Array.isArray(transforms) ? transforms : [transforms];
    let result = value;

    for (const t of transformList) {
        if (typeof t === "function") {
            result = t(result, context);
        } else if (typeof t === "string") {
            const fn = TransformFunctions[t];
            if (fn) {
                result = fn(result);
            } else {
                logger.warn(`[TemplateEngine] Transform '${t}' not found.`);
            }
        }
    }

    return result;
};


/**
 * Main entry point: Apply a template object to a context ✅
 */
export const applyTemplate = (template, context) => {
    if (!template || typeof template !== "object") {
        throw new Error('Output Template must be an object for collections and tables.');
    }

    const result = {};

    for (const [key, config] of Object.entries(template)) {
        // 1. Handle Conditional logic if present
        if (typeof config === "object" && config !== null && config.condition) {
            const isConditionMet = evaluateCondition(config.condition, context, key);
            if (!isConditionMet) {
                continue;
            }
        }

        // 2. Resolve final value
        let value;

        if (typeof config === "object" && config !== null) {
            // Case A: Explicit field mapping { field: "source_key", transform: "..." }
            if (config.field) {
                value = context[config.field];

                // Apply transforms if defined
                if (config.transform) {
                    value = applyTransforms(value, config.transform, context);
                }
            }
            // Case B: Literal value { value: "static_val" }
            else if (config.value !== undefined) {
                value = config.value;
            }
            // Case C: Nested Template (Recursive application)
            else {
                value = applyTemplate(config, context);
            }
        }
        // Case D: Simple literal or fallback
        else {
            value = config;
        }

        result[key] = value;
    }

    return result;
};
