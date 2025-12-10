// services/mapperService.js


/**
 * Evaluates a cascading-advanced configuration against the input data.
 * RETURNS: { value: any, isKilled: boolean }
 */
const evaluateCascadingAdvanced = (data, config) => {
  for (const clause of config.clauses) {
    let rulesMatch = false;

    if (clause.rootLogicType === "AND") {
      rulesMatch = clause.rules.every((rule) => evaluateCondition(data, rule));
    } else if (clause.rootLogicType === "OR") {
      rulesMatch = clause.rules.some((rule) => evaluateCondition(data, rule));
    }

    if (rulesMatch) {
      return {
        value: clause.thenValue,
        isKilled: clause.isKilled === true,
      };
    }
  }

  // If no clause matches, check the elseValue for a kill flag (if present on the config object)
  const isKilledByElse = config.isKilled === true;
  return {
    value: config.elseValue,
    isKilled: isKilledByElse,
  };
};

/**
 * A central function to process and apply any single rule configuration item.
 * Updated to unpack the { value, isKilled } object from cascading-advanced logic.
 */
const applyRule = (data, ruleValue, ruleKey) => {
  // 1. Conditional Mapping: 'cascading-advanced' object
  if (
    typeof ruleValue === "object" &&
    ruleValue !== null &&
    ruleValue.type === "cascading-advanced"
  ) {
    const result = evaluateCascadingAdvanced(data, ruleValue);

    // Check if the result includes the kill status
    if (result.isKilled) {
      // Return a special structured object that includes the value and the kill flag
      return { value: result.value, isKilled: true };
    }

    // If not killed, just return the value
    return result.value;
  }

  // 2. Variable Mapping or Direct Value Mapping
  // (Remaining logic is unchanged)

  if (typeof ruleValue === "string" && ruleValue.startsWith("var(")) {
    const varMatch = ruleValue.match(/^var\((.+)\)$/);
    if (varMatch && varMatch[1]) {
      const sourceField = varMatch[1];
      return data[sourceField];
    }
  }

  return ruleValue;
};

/**
 * Transforms the input data based on the defined rules in MappingCONFIG.
 * Updated to stop and return the structured kill object if a kill is detected.
 */
export const transformData = (input, configRules) => {
  const transformed = { ...input };

  for (const [sectionKey, sectionConfig] of Object.entries(configRules)) {
    // Skip non-mapping sections
    if (
      typeof sectionConfig !== "object" ||
      sectionConfig === null ||
      Array.isArray(sectionConfig)
    ) {
      continue;
    }

    for (const [fieldKey, ruleValue] of Object.entries(sectionConfig)) {
      const derivedValue = applyRule(transformed, ruleValue, fieldKey);

      // 🚨 NEW LOGIC: Check for the structured kill object
      if (
        typeof derivedValue === "object" &&
        derivedValue !== null &&
        derivedValue.isKilled === true
      ) {
        // If a kill signal is found, stop all processing and return the signal.
        // This object contains the value for the field that triggered the kill.
        return {
          isKilled: true,
          sourceField: fieldKey,
          killValue: derivedValue.value,
          data: transformed, // Return the partially transformed data
        };
      }

      // Assign the value (if not a kill object, it's the final value)
      transformed[fieldKey] = derivedValue;
    }
  }

  // If processing completes without a kill signal
  return transformed;
};
