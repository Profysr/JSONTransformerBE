import { TransformFunctions } from "./config/TransformFunctions.js";
import logger from "../lib/logger.js";

/**
 * TemplateEngine.js
 * 
 * Centralized engine for applying templates to data objects.
 * Supports:
 * 1. String Interpolation: "{{key}}"
 * 2. Transformations: "{{key|transform1|transform2}}"
 * 3. Conditional Fields: { value: "{{key}}", condition: "expression" }
 */

/**
 * Helper: Evaluate a simple condition string against the context
 * WARNING: Uses new Function() - ensure inputs are trusted configuration.
 */
const evaluateCondition = (conditionStr, context) => {
    try {
        // Create a function that returns the result of the expression
        const func = new Function("context", `with(context) { return ${conditionStr}; }`);
        return func(context);
    } catch (error) {
        logger.warn(`[TemplateEngine] Condition evaluation failed: "${conditionStr}". Error: ${error.message}`);
        return false;
    }
};

/**
 * Apply a template string with variable substitution and transformations
 */
const processTemplateString = (templateStr, context) => {
    if (typeof templateStr !== "string" || !templateStr.includes("{{")) {
        return templateStr;
    }

    // Extract {{variable|transform1|transform2}}
    const match = templateStr.match(/\{\{(.+?)\}\}/);
    if (!match) {
        return templateStr;
    }

    const parts = match[1].split("|");
    const varName = parts[0].trim();
    const transforms = parts.slice(1).map(t => t.trim());

    // Resolve value from context (support nested keys potentially, but flat for now)
    let value = context[varName];

    // Apply transformations in sequence
    for (const transformName of transforms) {
        const transformFn = TransformFunctions[transformName];
        if (transformFn) {
            value = transformFn(value);
        } else {
            logger.warn(`[TemplateEngine] Transform function '${transformName}' not found.`);
        }
    }

    // Return the resolved value (preserves type if it was just {{val}})
    // If text surrounds it like "Prefix {{val}} Suffix", it becomes string.
    if (match[0] === templateStr) {
        return value;
    } else {
        return templateStr.replace(match[0], String(value));
    }
};

/**
 * Main function to apply a template object to a context
 */
export const applyTemplate = (template, context) => {
    if (!template || typeof template !== "object") return template;

    const result = {};

    for (const [key, config] of Object.entries(template)) {
        // Handle Conditional Fields
        if (typeof config === "object" && config !== null) {
            // Check condition if present
            if (config.condition) {
                const isConditionMet = evaluateCondition(config.condition, context);
                if (!isConditionMet) {
                    continue; // Skip field
                }
            }

            // Handle Value Resolution
            let value;

            // Case A: Explicit 'field' with optional 'transform'
            if (config.field) {
                value = context[config.field];

                if (config.transform) {
                    if (typeof config.transform === "function") {
                        value = config.transform(value, context);
                    } else if (typeof config.transform === "string") {
                        const transformFn = TransformFunctions[config.transform];
                        if (transformFn) {
                            value = transformFn(value);
                        } else {
                            logger.warn(`[TemplateEngine] Transform '${config.transform}' not found.`);
                        }
                    } else if (Array.isArray(config.transform)) {
                        // Support array of transforms
                        config.transform.forEach(t => {
                            if (typeof t === "function") {
                                value = t(value, context);
                            } else if (typeof t === "string") {
                                const fn = TransformFunctions[t];
                                if (fn) value = fn(value);
                            }
                        });
                    }
                }
            }
            // Case B: Explicit 'value' (String template or literal)
            else if (config.value !== undefined) {
                value = typeof config.value === 'string' ? processTemplateString(config.value, context) : config.value;
            }
            // Case C: Fallback (Just an object we don't recognize as a special config? Treat as nested?)
            // For now, let's assume if it has no 'field' or 'value' but WAS conditional (already passed), 
            // maybe it's a nested object? Or maybe we just skip/error?
            // Let's treat it as a literal object if it passed condition but has no specific resolution instructions
            else {
                // But wait, if it had ONLY 'condition', what is the value? 
                // Usually { value: "...", condition: "..." }
                // If structure is { condition: "...", ...nested... }? recursively apply?
                // For now, let's stick to the prompt's request: object for field mapping.
                // If it's none of the above, recursively apply template?
                value = applyTemplate(config, context);
            }

            result[key] = value;
            continue;
        }

        // Handle Simple Fields (String Templates or Literals)
        if (typeof config === "string") {
            result[key] = processTemplateString(config, context);
        } else {
            result[key] = config;
        }
    }

    return result;
};
