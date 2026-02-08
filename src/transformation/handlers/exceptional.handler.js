import { applyRule } from "../evaluators/ApplyRule.js";
import { handleRuleResult } from "../utils/transformationUtils.js";

// ==================
// Exception Rules Handler
// ==================
export const processExceptionRules = (inputData, rules, context, sectionKey = "") => {
  for (const [fieldKey, fieldValue] of Object.entries(rules)) {
    const derivedValue = applyRule(
      inputData,
      fieldValue,
      fieldKey,
      {},
      context,
      sectionKey
    );

    if (handleRuleResult(fieldKey, derivedValue, context, null, {}, sectionKey))
      return;
  }
};
