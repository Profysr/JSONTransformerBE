import { applyRule } from "../evaluators/ApplyRule.js";
import { handleRuleResult } from "../utils/transformationUtils.js";


// ==================
// 1 Main Handler
// ==================
export const processGeneralRules = (inputData, rules, context, sectionKey = "general") => {
  for (const [fieldKey, fieldValue] of Object.entries(rules)) {
    const derivedValue = applyRule(
      inputData,
      fieldValue,
      fieldKey,
      {},
      context,
    );

    if (handleRuleResult(fieldKey, derivedValue, context, `section:${sectionKey}`))
      return;
  }
};
