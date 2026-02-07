import { isEmpty } from "../../shared/utils/generalUtils.js";
import { applyRule } from "../evaluators/ApplyRule.js";
import { handleRuleResult, isTruthy } from "../utils/transformationUtils.js";

// ==================
// Exception Rules Handler
// ==================
export const processExceptionRules = (inputData, rules, context) => {
  for (const [fieldKey, fieldValue] of Object.entries(rules)) {
    const derivedValue = applyRule(
      inputData,
      fieldValue,
      fieldKey,
      {},
      context,
    );

    // Skip null, undefined, empty, "skip", false, 0, or unified values with falsy primaries
    if (derivedValue === "skip" || !isTruthy(derivedValue)) {
      continue;
    }

    if (handleRuleResult(fieldKey, derivedValue, context, "section:exception"))
      return;
  }
};
