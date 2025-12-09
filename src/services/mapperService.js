import { MappingCONFIG } from "../lib/configRules.js";
import { evaluateCondition } from "../lib/evaluateConditions.js";


/**
 * Executes a single rule condition against the input data.
 */
// const executeRule = (input, rule) => {
//   const inputValue = input[rule.field];

//   if (inputValue === undefined || inputValue === null) {
//     return false;
//   }

//   const inputToCompare = rule.caseSensitive
//     ? String(inputValue)
//     : String(inputValue).toLowerCase();
//   const valueToCompare = rule.caseSensitive
//     ? rule.value
//     : String(rule.value).toLowerCase();

//   switch (rule.operator) {
//     case "contains":
//       return inputToCompare.includes(valueToCompare);
//     case "equals":
//       return inputToCompare === valueToCompare;
//     // Add other operators (e.g., 'starts_with', 'greater_than') as needed
//     default:
//       console.warn(
//         `[MapperService] Unknown operator '${rule.operator}'. Rule skipped.`
//       );
//       return false;
//   }
// };

/**
 * Evaluates a cascading-advanced configuration against the input data.
 */
const evaluateCascadingAdvanced = (data, config) => {
  for (const clause of config.clauses) {
    if (clause.rootLogicType === "AND") {
      const allRulesMatch = clause.rules.every((rule) =>
        evaluateCondition(data, rule)
      );
      if (allRulesMatch) {
        return clause.thenValue;
      }
    } else if (clause.rootLogicType === "OR") {
      const anyRuleMatch = clause.rules.some((rule) => executeRule(data, rule));
      if (anyRuleMatch) {
        return clause.thenValue;
      }
    }
  }
  return config.elseValue;
};

/**
 * A central function to process and apply any single rule configuration item.
 */
const applyRule = (data, ruleValue, ruleKey) => {
    // 1. Variable Mapping: 'var(some_field)'
    if (typeof ruleValue === 'string' && ruleValue.startsWith('var(')) {
        const varMatch = ruleValue.match(/^var\((.+)\)$/); 
        if (varMatch && varMatch[1]) {
            const sourceField = varMatch[1];
            return data[sourceField]; 
        }
    }
    
    // 2. Conditional Mapping: 'cascading-advanced' object
    if (typeof ruleValue === 'object' && ruleValue !== null && ruleValue.type === 'cascading-advanced') {
        return evaluateCascadingAdvanced(data, ruleValue);
    }

    // 3. Direct Value Mapping (string, number, boolean, or other static object)
    return ruleValue;
};

/**
 * Transforms the input data based on the defined rules in MappingCONFIG.
 */
export const transformData = (input) => {
  const transformed = { ...input };

  // Iterate over each major section of the MappingCONFIG (e.g., letter_type_configuration, forward_letter)
  for (const [sectionKey, sectionConfig] of Object.entries(MappingCONFIG)) {
    // if (sectionKey === "readCodes") {
    //   continue;
    // }

    // Skip config keys like 'client_id' and 'letter_type_from' which aren't mapping sections
    if (
      typeof sectionConfig !== "object" ||
      sectionConfig === null ||
      Array.isArray(sectionConfig)
    ) {
      continue;
    }

    // Iterate over each field/rule within the section (e.g., letter_type, letter_date, is_rpa_check_fond)
    for (const [fieldKey, ruleValue] of Object.entries(sectionConfig)) {
      const derivedValue = applyRule(transformed, ruleValue, fieldKey);
      transformed[fieldKey] = derivedValue;
    }
  }

  return transformed;
};
