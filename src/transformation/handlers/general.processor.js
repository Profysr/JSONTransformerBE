import { applyRule } from "../evaluators/ApplyRule.js";
import { handleRuleResult } from "../utils/transformationUtils.js";


// ==================
// 1 Main Handler
// ==================
export const processGeneralRules = (inputData, rules, context) => {
  for (const [fieldKey, fieldValue] of Object.entries(rules)) {
    const derivedValue = applyRule(
      inputData,
      fieldValue,
      fieldKey,
      {},
      context,
    );

    if (handleRuleResult(fieldKey, derivedValue, context, "section:general"))
      return;
  }
};
