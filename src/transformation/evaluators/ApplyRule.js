import logger from "../../shared/logger.js";
import { resolveVariable } from "../../shared/utils/generalUtils.js";
import { isAdvancedLogic } from "../utils/transformationUtils.js";
import { evaluateCascadingAdvanced } from "./EvaluateRule.js";


// ==================
// 1 Rule Dispatcher
// ==================
/**
 * Orchestrates the application of rules based on type:
 * 1. Advanced Logic (Conditional)
 * 2. Variable Resolution
 * 3. Static Mapping
 */
export const applyRule = (
  inputData,
  fieldValue,
  fieldKey,
  localContext = {},
  context = null,
  sectionKey = "",
) => {
  const logMeta = { sectionKey, functionName: "applyRule", fieldKey: fieldKey || "unknown" };

  // 1. Check for Advanced Logic
  if (isAdvancedLogic(fieldValue)) {
    const result = evaluateCascadingAdvanced(
      inputData,
      fieldValue,
      fieldKey,
      localContext,
      context,
      sectionKey
    );

    if (result.isKilled) {
      return result;
    }
    return result;
  }

  // 2. Check for Variables
  if (typeof fieldValue === "string" && fieldValue.includes("var(")) {
    return resolveVariable(
      fieldValue,
      inputData,
      localContext,
      fieldKey,
      context,
      sectionKey
    );
  }

  // 3. Static Assignment
  if (
    inputData.hasOwnProperty(fieldKey) &&
    inputData[fieldKey] !== fieldValue
  ) {
    logger.info(
      `Overriding existing value "${inputData[fieldKey]}" with preferred static value: "${fieldValue}"`,
      logMeta
    );
  }

  // 4. Fallback
  return fieldValue;
};
