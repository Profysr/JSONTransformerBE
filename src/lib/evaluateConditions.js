import { OPERATORS, getValue } from "../utils/Operators.js";
import logger from "./logger.js";
import { isEmpty, resolveDeep } from "../utils/util.js";

/**
 * Helper to resolve a value from multiple sources: InputData, Local (Row) Context, and Global Context.
 */
const getActualValue = (path, inputData, localContext, context, isField) => {
  // 1. Try to resolve as a variable first (recursively if needed)
  const resolved = resolveDeep(path, inputData, localContext, "", context);

  // if (it was a var() string), return it
  if (resolved !== path) return resolved;

  // 2. Try implicit path resolution (e.g. "metrics.0.value")
  // Lookup Order: Local Context -> Input Data -> Global Snapshot
  const snapshot = context && typeof context.getSnapshot === "function" ? context.getSnapshot() : {};
  const val = getValue(path, localContext, inputData, snapshot);

  // If it's the 'value' part and not found as a property, treat as literal
  if (val === undefined && !isField) return path;
  return val;
}

/**
 * Resolves a value from inputData, localContext, or as a literal.
 * Supports var(...) syntax and path resolution.
 */
export const resolveValue = (path, inputData, localContext = {}, ruleKey = "", isField = false, context = null) => {
  if (typeof path !== "string") return path;
  return getActualValue(path, inputData, localContext, context, isField);
};

export function evaluateCondition(inputData, condition, ruleKey, localContext = {}, context = null) {
  try {
    const { field, operator, value } = condition;
    const caseSensitive = !!condition.case_sensitive || !!condition.caseSensitive || false;

    const fieldVal = resolveValue(field, inputData, localContext, ruleKey, true, context);
    const inputVal = resolveValue(value, inputData, localContext, ruleKey, false, context);

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

    logger.info(`[${ruleKey}] ${field}[${fieldVal}] ${operator} [${inputVal}] => ${result}`);
    return result;

  } catch (error) {
    logger.error(`[${ruleKey}] Condition Error: ${error.message}`);
    throw error; // Re-throw to fail the whole transformation (Strict Mode)
  }
}
