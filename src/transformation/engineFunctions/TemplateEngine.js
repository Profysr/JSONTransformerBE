import { TransformFunctions } from "./transformFunctions.js";
import logger from "../../shared/logger.js";
import { evaluateCondition } from "../evaluators/conditionEvaluator.js";
import { isEmpty } from "../../shared/utils/generalUtils.js";
import { isUnifiedValue } from "../utils/transformationUtils.js";
import { ErrorHandler } from "../../api/middleware/errorHandler.js";

// ==================
// 1 Recursively evaluate conditions (logical groups or operator rules)
// ==================

const evaluateTemplateCondition = (
  condition,
  rowData,
  ruleKey = "Global",
  context = null,
  logPrefix = null,
) => {
  if (!condition) return true;

  if (Array.isArray(condition)) {
    return condition.every((c) =>
      evaluateTemplateCondition(c, rowData, ruleKey, context),
    );
  }

  const type = typeof condition;

  if (type === "string") {
    try {
      const func = new Function(
        "context",
        "ctx",
        `with(context) { return ${condition}; }`,
      );
      return func(rowData, rowData);
    } catch (error) {
      logger.warn(
        `Logic internal evaluation error: "${condition}". Details: ${error.message}`,
        { sectionKey: "general", functionName: "evaluateTemplateCondition", condition, fieldKey: ruleKey }
      );
      return false;
    }
  }

  if (type === "object" && condition !== null) {
    const { logic, rules, field, operator } = condition;

    if (logic) {
      const list = rules || [];
      return logic === "OR"
        ? list.some((r) =>
          evaluateTemplateCondition(r, rowData, ruleKey, context, logPrefix),
        )
        : list.every((r) =>
          evaluateTemplateCondition(r, rowData, ruleKey, context, logPrefix),
        );
    }

    if (field && operator) {
      return evaluateCondition(
        null,
        condition,
        ruleKey,
        rowData,
        context,
        logPrefix,
      );
    }
  }

  return false;
};

// ==================
// 2 Transformation Application
// ==================

const applyTransforms = (value, transforms, context) => {
  if (!transforms) return value;

  const transformList = Array.isArray(transforms) ? transforms : [transforms];
  let result = value;

  for (const t of transformList) {
    if (typeof t === "function") {
      result = t(result, context);
    } else if (typeof t === "string") {
      const fn = TransformFunctions[t];
      if (fn) {
        result = fn(result, context);
      } else {
        logger.warn(`Transform '${t}' not found.`, { sectionKey: "general", functionName: "applyTransforms", transform: t });
      }
    }
  }

  return result;
};

// ==================
// 3 Main Template Engine
// ==================
/**
 * Main entry point: Apply a template object to a context
 */
export const applyTemplate = (
  template,
  rowData,
  context = null,
  logPrefix = null,
) => {
  // 3.1 Validate Input
  if (!template || typeof template !== "object") {
    return new ErrorHandler(
      400,
      "Output Template must be an object for collections and tables.",
    );
  }

  const result = {};

  // 3.2 Process Template Keys
  for (const [key, config] of Object.entries(template)) {
    // 3.3 Evaluate Key Conditions
    if (typeof config === "object" && config !== null && config.condition) {
      const isConditionMet = evaluateTemplateCondition(
        config.condition,
        rowData,
        key,
        context,
        logPrefix,
      );
      if (!isConditionMet) {
        result[key] = null;
        continue;
      }
    }

    let value;

    // 3.4 Resolve Value
    if (typeof config === "object" && config !== null) {
      if (config.field) {
        value = rowData[config.field];

        if (config.transform) {
          value = applyTransforms(value, config.transform, rowData);
        }
      } else if (config.value !== undefined) {
        value = config.value;
      } else if (!config.condition || Object.keys(config).length > 1) {
        if (!config.field && config.value === undefined) {
          value = applyTemplate(config, rowData, context, logPrefix);
        }
      }
    } else {
      value = config;
    }

    // 3.5 Handle Unified vs Simple Values
    if (isUnifiedValue(value)) {
      result[key] = value.primaryValue;
      Object.keys(value).forEach((depKey) => {
        if (depKey !== "primaryValue") result[depKey] = value[depKey];
      });
    } else {
      result[key] = isEmpty(value) ? null : value;
    }
  }

  return result;
};
