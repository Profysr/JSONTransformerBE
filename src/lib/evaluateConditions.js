import { OPERATORS, getValue } from "../utils/Operators.js";
import logger from "./logger.js";
import { isEmpty, resolveVariable } from "../utils/utils.js";

/**
 * Executes a single rule condition against the input data.
 * Returns false and logs an error if any required component is missing or invalid.
 */

export function evaluateCondition(inputData, condition, ruleKey, localContext = {}) {
  try {
    const { field, operator, value } = condition;
    const caseSensitive = !!condition.case_sensitive || false;

    // Helper: Variable or Path Resolution
    const resolve = (path, isField = false) => {
      if (typeof path !== "string") return path;
      if (path.startsWith("var(")) {
        return resolveVariable(path, inputData, localContext, ruleKey);
      }
      const val = getValue(path, localContext, inputData);

      // If it's the 'value' part and not found as a property, treat as literal
      if (val === undefined && !isField) return path;
      return val;
    };

    const fieldVal = resolve(field, true);
    const inputVal = resolve(value, false);

    if (fieldVal === false) {
      logger.error(`[${ruleKey}] Field '${field}' is not found in input inputData. Skipping Condition`);
      return false;
    }

    // Validation & Early Exits
    const handler = OPERATORS[operator];
    if (!handler) throw new Error(`Unknown operator: ${operator}`);

    const isUnary = ["is_empty", "is_not_empty", "is_null", "is_not_null"].includes(operator);
    if (!isUnary && isEmpty(inputVal)) {
      logger.error(`[${ruleKey}] Missing value for operator ${operator}`);
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
