import logger from "./logger.js";

/**
 * Executes a single rule condition against the input data.
 * Returns false and logs an error if any required component is missing or invalid.
 */
export function evaluateCondition(inputData, condition, ruleKey) {
  try {
    // 1. Validate Condition Object Structure
    if (!condition) {
      logger.error(`[${ruleKey}] Condition object is undefined or null.`);
      return false;
    }

    let { field, operator, value: targetValue } = condition;
    const caseSensitive = !!condition.case_sensitive;

    // Handle var() in field (extract field name)
    if (typeof field === "string" && field.startsWith("var(")) {
      const fieldMatch = field.match(/^var\((.+)\)$/);
      if (fieldMatch && fieldMatch[1]) {
        field = fieldMatch[1].trim();
      }
    }

    // Handle var() in targetValue (resolve value from inputData)
    if (typeof targetValue === "string" && targetValue.startsWith("var(")) {
      const valueMatch = targetValue.match(/^var\((.+)\)$/);
      if (valueMatch && valueMatch[1]) {
        const sourcePath = valueMatch[1].trim();
        // Resolve nested path in inputData
        const resolvedValue = sourcePath
          .split(".")
          .reduce((acc, part) => (acc ? acc[part] : undefined), inputData);

        logger.info(`[${ruleKey}] Resolved var(${sourcePath}) to: ${resolvedValue}`);
        targetValue = resolvedValue;
      }
    }

    // Resolve sourceValue (handle nested paths if present)
    const sourceValue = inputData && typeof field === "string"
      ? field.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), inputData)
      : undefined;

    // 2. Strict Exception: Missing Field in Input
    if (sourceValue === undefined || sourceValue === null || sourceValue === "") {
      logger.error(`[${ruleKey}] Field "${field}" is missing in Input JSON`);
      return false;
    }

    // 3. Strict Exception: Checking if targetValue is missing + operators are not unary.
    const isUnaryOperator = ["is_empty", "is_not_empty"].includes(operator);
    if (
      (targetValue === undefined || targetValue === null || targetValue === "") &&
      !isUnaryOperator
    ) {
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

    const result = handler(sourceValue, targetValue);

    logger.info(
      `[${ruleKey}] Evaluation: '[${field}: ${sourceValue}]' ${operator} '[${targetValue}]' => ${result}`
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
