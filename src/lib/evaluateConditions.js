import logger from "./logger.js";
import { resolveVariable, isEmpty } from "./utils.js";

/**
 * Executes a single rule condition against the input data.
 * Returns false and logs an error if any required component is missing or invalid.
 */
export function evaluateCondition(inputData, condition, ruleKey, localContext = {}) {
  try {

    let { field, operator, value: fieldInInput } = condition;
    const caseSensitive = !!condition.case_sensitive;

    // Resolve field value from var() syntax
    let fieldInCondition;
    if (typeof field === "string" && field.startsWith("var(")) {
      fieldInCondition = resolveVariable(field, inputData, localContext, ruleKey);
    } else {
      // Direct field name (fallback for non-var syntax)
      fieldInCondition = typeof field === "string"
        ? field.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), localContext)
        : undefined;

      if (fieldInCondition === undefined) {
        fieldInCondition = inputData && typeof field === "string"
          ? field.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), inputData)
          : undefined;
      }
    }

    // Resolve fieldInInput if it's a variable
    if (typeof fieldInInput === "string" && fieldInInput.startsWith("var(")) {
      fieldInInput = resolveVariable(fieldInInput, inputData, localContext, ruleKey);
    }

    // Check if field value is missing
    if (isEmpty(fieldInCondition)) {
      logger.error(`[${ruleKey}] Field "${field}" is missing in Input JSON`, localContext);
      return false;
    }

    // Check if fieldInInput is missing for non-unary operators
    const isUnaryOperator = ["is_empty", "is_not_empty", "is_null", "is_not_null"].includes(operator);
    if (isEmpty(fieldInInput) && !isUnaryOperator) {
      logger.error(
        `[${ruleKey}] Value is undefined in condition for operator "${operator}".`
      );
      return false;
    }

    // Helper: Prepare values with strict type checking
    const prepare = (val) => {
      // if (val === null || val === undefined) return "";
      const str = String(val);
      return caseSensitive ? str : str.toLowerCase();
    };

    const isNumeric = (v) => {
      // if (v === null || v === undefined || v === "")
      //   return false;
      const num = Number(v);
      return !Number.isNaN(num) && isFinite(num);
    };

    // Helper for numeric operations to flag type errors
    const evalNumeric = (src, tgt, op, fn) => {
      if (!isNumeric(src) || !isNumeric(tgt)) {
        logger.error(
          `[${ruleKey}] Numeric operator "${op}" failed. Source: ${src}, Target: ${tgt}`
        );
        return false;
      }
      return fn(Number(src), Number(tgt));
    };

    const operatorHandlers = {
      contains: (src, tgt) => prepare(src).includes(prepare(tgt)),
      not_contains: (src, tgt) => !prepare(src).includes(prepare(tgt)),

      equals: (src, tgt) => {
        if (isNumeric(src) && isNumeric(tgt)) return Number(src) === Number(tgt);
        return prepare(src) === prepare(tgt);
      },
      not_equals: (src, tgt) => {
        if (isNumeric(src) && isNumeric(tgt)) return Number(src) !== Number(tgt);
        return prepare(src) !== prepare(tgt);
      },

      starts_with: (src, tgt) => prepare(src).startsWith(prepare(tgt)),
      not_starts_with: (src, tgt) => !prepare(src).startsWith(prepare(tgt)),
      ends_with: (src, tgt) => prepare(src).endsWith(prepare(tgt)),
      not_ends_with: (src, tgt) => !prepare(src).endsWith(prepare(tgt)),

      is_empty: (src) => {
        if (src === null || src === undefined) return true;
        if (typeof src === "string") return src.trim().length === 0;
        if (Array.isArray(src)) return src.length === 0;
        if (typeof src === "object") return Object.keys(src).length === 0;
        return false;
      },
      is_not_empty: (src) => !operatorHandlers.is_empty(src),

      is_null: (src) => src === null,
      is_not_null: (src) => src !== null,

      less_than: (src, tgt) =>
        evalNumeric(src, tgt, "less_than", (s, t) => s < t),
      less_than_or_equal_to: (src, tgt) =>
        evalNumeric(src, tgt, "less_than_or_equal_to", (s, t) => s <= t),
      greater_than: (src, tgt) =>
        evalNumeric(src, tgt, "greater_than", (s, t) => s > t),
      greater_than_or_equal_to: (src, tgt) =>
        evalNumeric(src, tgt, "greater_than_or_equal_to", (s, t) => s >= t),
    };

    // 4. Strict Exception: Unknown Operator
    const handler = operatorHandlers[operator];
    if (!handler) {
      logger.error(`[${ruleKey}] Unknown or undefined operator: "${operator}".`);
      return false;
    }

    const result = handler(fieldInCondition, fieldInInput);

    logger.info(
      `[${ruleKey}] Evaluation: '[${field}: ${fieldInCondition}]' ${operator} '[${fieldInInput}]' => ${result}`
    );

    return result;
  } catch (error) {
    logger.error(`[${ruleKey}] Error in evaluateCondition:`, {
      error: error.message,
      stack: error.stack,
      field: condition?.field,
      operator: condition?.operator,
    });
    return false;
  }
}
