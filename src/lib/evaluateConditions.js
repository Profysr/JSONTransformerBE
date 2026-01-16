import { OPERATORS, getValue } from "../utils/Operators.js";
import logger from "./logger.js";
import { isEmpty, resolveVariable } from "../utils/util.js";

/**
 * Executes a single rule condition against the input data.
 * Returns false and logs an error if any required component is missing or invalid.
 */

/**
 * Resolves a value from inputData, localContext, or as a literal.
 * Supports var(...) syntax and path resolution.
 */
export const resolveValue = (path, inputData, localContext = {}, ruleKey = "", isField = false) => {
  if (typeof path !== "string") return path;
  if (path.startsWith("var(")) {
    return resolveVariable(path, inputData, localContext, ruleKey);
  }
  const val = getValue(path, localContext, inputData);

  // If it's the 'value' part and not found as a property, treat as literal
  if (val === undefined && !isField) return path;
  return val;
};

export function evaluateCondition(inputData, condition, ruleKey, localContext = {}) {
  try {
    const { field, operator, value } = condition;
    const caseSensitive = !!condition.case_sensitive || !!condition.caseSensitive || false;

    const fieldVal = resolveValue(field, inputData, localContext, ruleKey, true);
    const inputVal = resolveValue(value, inputData, localContext, ruleKey, false);

    if (fieldVal === false && !["is_null", "is_empty"].includes(operator)) {
      logger.warn(`[${ruleKey}] Field '${field}' is not found in inputData. Skipping Condition`);
      return false;
    }

    // Validation & Early Exits
    const handler = OPERATORS[operator];
    if (!handler) throw new Error(`Unknown operator: ${operator}`);

    const isUnary = ["is_empty", "is_not_empty", "is_null", "is_not_null"].includes(operator);
    if (!isUnary && isEmpty(inputVal)) {
      logger.warn(`[${ruleKey}] Missing value for operator ${operator}`);
      return false;
    }

    // Execution
    const prep = (v) => (caseSensitive ? String(v ?? "") : String(v ?? "").toLowerCase());
    const result = !!handler(fieldVal, inputVal, prep);

    logger.info(`[${ruleKey}] ${field}(${fieldVal}) ${operator} ${value}(${inputVal}) => ${result}`);
    return result;

  } catch (error) {
    logger.error(`[${ruleKey}] Condition Error: ${error.message}`);
    return false;
  }
}
