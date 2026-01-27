import { isEmpty } from "../../utils/util.js";
import { applyRule } from "../Evaluators/ApplyRule.js";
import { isUnifiedValue, processUnifiedValue, handleRuleResult } from "../../utils/transformationUtils.js";

// There will be 2 kinda values -- object or a string.  if object, then there will be possibility of kill
export const processGeneralRules = (inputData, rules, context) => {
    for (const [fieldKey, fieldValue] of Object.entries(rules)) {
        const derivedValue = applyRule(inputData, fieldValue, fieldKey, {}, context);
        
        if (handleRuleResult(fieldKey, derivedValue, context, `section:general`)) return;
    }
}
