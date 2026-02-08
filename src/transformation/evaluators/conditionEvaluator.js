import logger from "../../shared/logger.js";
import { isEmpty, resolveDeep } from "../../shared/utils/generalUtils.js";
import { ErrorHandler } from "../../api/middleware/errorHandler.js";
import { getValue, OPERATORS } from "../utils/operators.js";

// ==================
// 1 Value Resolution Logic
// ==================
/**
 * Helper to resolve a value from multiple sources
 */
const getActualValue = (path, inputData, localContext, context, isField, ruleKey = "") => {
  // 1. Resolve variable or path
  const resolved = resolveDeep(path, inputData, localContext, "", ruleKey, context);
  if (resolved !== path) return resolved;

  // 2. Implicit path resolution
  const snapshot =
    context && typeof context.getSnapshot === "function"
      ? context.getSnapshot()
      : {};

  const val = getValue(path, localContext, inputData, snapshot);

  if (val === undefined && !isField) return path;
  return val;
};

/**
 * Higher-level resolver supporting var(...) syntax
 */
export const resolveValue = (
  path,
  inputData,
  localContext = {},
  ruleKey = "",
  isField = false,
  context = null,
) => {
  if (typeof path !== "string") return path;
  return getActualValue(
    path,
    inputData,
    localContext,
    context,
    isField,
    ruleKey,
  );
};

// ==================
// 2 Condition Evaluation Engine
// ==================
export function evaluateCondition(
  inputData,
  condition,
  ruleKey,
  localContext = {},
  context = null,
  // logPrefix = null,
) {
  try {
    const { field, operator, value } = condition;
    const caseSensitive =
      !!condition.case_sensitive || !!condition.caseSensitive || false;

    const fieldVal = resolveValue(
      field,
      inputData,
      localContext,
      ruleKey,
      true,
      context,
    );
    const inputVal = resolveValue(
      value,
      inputData,
      localContext,
      ruleKey,
      false,
      context,
    );

    if (fieldVal === undefined && !["is_null", "is_empty"].includes(operator)) {
      logger.warn(
        `Property '${field}' was not found in either patient data or configuration row. Skipping configuration criteria.`,
        { sectionKey: "general", functionName: "evaluateCondition", field, fieldKey: ruleKey }
      );
      return false;
    }

    const handler = OPERATORS[operator];
    if (!handler) return new ErrorHandler(400, `Unknown operator: ${operator}`);

    const isUnary = [
      "is_empty",
      "is_not_empty",
      "is_null",
      "is_not_null",
    ].includes(operator);
    if (!isUnary && isEmpty(inputVal)) {
      logger.warn(
        `Missing comparison value for operator '${operator}'.`,
        { sectionKey: "general", functionName: "evaluateCondition", operator, fieldKey: ruleKey }
      );
      return false;
    }

    const prep = (v) =>
      caseSensitive ? String(v ?? "") : String(v ?? "").toLowerCase();
    const result = !!handler(fieldVal, inputVal, prep);

    logger.info(
      `Checking if '${field}' (${fieldVal}) ${operator} '${inputVal}' --> Result: ${result}`,
      { sectionKey: "general", functionName: "evaluateCondition", field, fieldKey: ruleKey }
    );
    return result;
  } catch (error) {
    logger.error(
      `Unexpected evaluation error: ${error.message}`,
      { sectionKey: "general", functionName: "evaluateCondition", fieldKey: ruleKey, err: error }
    );
    return new ErrorHandler(
      500,
      `Condition evaluation failed: ${error.message}`,
    );
  }
}
