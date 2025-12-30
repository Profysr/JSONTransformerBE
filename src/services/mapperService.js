import { evaluateCondition } from "../lib/evaluateConditions.js";
import logger from "../lib/logger.js";

/**
 * Helper to evaluate a list of rules based on logic type (AND/OR).
 */
const evaluateRuleList = (data, rules, logicType, fieldKey) => {
  if (!rules || rules.length === 0) {
    logger.error(`[${fieldKey}] No rules found for key: ${fieldKey}`);
    return false;
  }

  const result =
    logicType === "OR"
      ? rules.some((rule) => evaluateRuleRecursive(data, rule, fieldKey))
      : rules.every((rule) => evaluateRuleRecursive(data, rule, fieldKey));

  return result;
};

/**
 * Recursive function to evaluate a single rule or a group of rules.
 */
const evaluateRuleRecursive = (data, rule, fieldKey) => {
  if (rule?.type === "group") {
    logger.info(`[${fieldKey}] Evaluating Group (Logic: ${rule.logicType})`);
    return evaluateRuleList(data, rule.rules, rule.logicType, fieldKey);
  }

  // const conditionId = rule.id || "unknown-id";
  const result = evaluateCondition(data, rule, fieldKey);
  // logger.info(
  //   `[${fieldKey}] Condition ${conditionId} (${rule.field} ${rule.operator} ${rule.value}) result: ${result}`
  // );
  return result;
};

/**
 * Evaluates a single cascading-advanced condition
 */
const evaluateCascadingAdvanced = (data, config, fieldKey) => {
  for (const [index, clause] of config.clauses.entries()) {
    logger.info(
      `[${fieldKey}] Evaluating Clause ${index + 1} (RootLogic: ${
        clause.rootLogicType
      })`
    );

    let rulesMatch = evaluateRuleList(
      data,
      clause.rules,
      clause.rootLogicType,
      fieldKey
    );

    /** if condition satisfied, return thenValue */
    if (rulesMatch) {
      let isKilled = clause.isKilled === true;
      logger.info(`[${fieldKey}] Condition satisfied at Clause ${index + 1}.`);
      return {
        value: clause.thenValue,
        isKilled,
      };
    } else {
      logger.info(
        `[${fieldKey}] Condition didn't satisfied at Clause ${index + 1}.`
      );
    }
  }

  /** if there's no condition match, simply extract the elseVal from config and return it */
  const isKilled = config.isKilled === true;
  logger.info(
    `[${fieldKey}] No condition satisfied, using elseValue - ${config.elseValue}.`
  );
  return {
    value: config.elseValue,
    isKilled: isKilled,
  };
};

/**
 * A central function to process and apply any configurations rules on the data.
 */
const applyRule = (data, fieldValue, fieldKey) => {
  // 1. Check if the fieldValue is configured through advanced logic
  if (
    typeof fieldValue === "object" &&
    fieldValue !== null &&
    fieldValue.type === "cascading-advanced"
  ) {

    logger.info(`[${fieldKey}] Evaluating cascading-advanced condition rule`);
    const result = evaluateCascadingAdvanced(data, fieldValue, fieldKey);

    /** if isKilled true, return it */
    if (result.isKilled) {
      return { value: result.value, isKilled: true };
    }
    return result.value;
  }

  // 2. Check if the fieldValue is a variable
  fieldValue = fieldValue.trim();

  if (typeof fieldValue === "string" && fieldValue.includes("var(")) {
    const varMatch = fieldValue.match(/^var\((.+)\)$/);
    if (varMatch && varMatch[1]) {
      /** for example: if we set 'letter_date: var(incident_date)', then letter_date is the fieldKey and incident_date is the sourceField */
      const sourceField = varMatch[1].trim();

      // Skip self-mapping (e.g., letter_date: var(letter_date))
      if (sourceField === fieldKey) {
        logger.info(
          `[${fieldKey}] Skipping self-mapping for field: ${fieldKey}`
        );
        return fieldValue;
      }

      logger.info(`[${fieldKey}] Mapping '${fieldKey}' with '${sourceField}'`);
      return data[sourceField];
    }
  }

  // 3. if property is already present, but still there's mapping required
  if (data.hasOwnProperty(fieldKey)) {
    logger.info(
      `[${fieldKey}] Mapping '${fieldKey}' with static value: '${fieldValue}'`
    );
    return fieldValue;
  }

  // 4. If fieldValue is not present in our JSON, just add it with the value
  logger.info(
    `[No property match] Adding '${fieldKey}' with value: '${fieldValue}'`
  );
  return fieldValue;
};

/**
 * Transforms the input data based on the defined rules in MappingCONFIG.
 */
export const transformData = (input, configRules) => {
  logger.info("Starting data transformation");
  const transformed = { ...input };

  /**
   * configRules structure:
   * {
   *  letter_type_configurations: {
   *  letter_type: fieldValue}
   * }
   */
  
  for (const [sectionKey, sectionConfig] of Object.entries(configRules)) {
    /** As you can see, in the structure, sectionKey is the letter_type_configurations whereas its type is object. We're not dealing with those scenarios */
    if (
      typeof sectionConfig !== "object" ||
      sectionConfig === null ||
      Array.isArray(sectionConfig)
    ) {
      logger.warn(`[${sectionKey}] Skipping non-object section: ${sectionKey}`);
      continue;
    }

    /** Iterating over the sectionConfig */
    for (const [fieldKey, fieldValue] of Object.entries(sectionConfig)) {
      const derivedValue = applyRule(transformed, fieldValue, fieldKey);

      /** Looking for if the applyRule return isKilled: true */
      if (
        typeof derivedValue === "object" &&
        derivedValue !== null &&
        derivedValue.isKilled === true
      ) {
        logger.error(
          `[${fieldKey}] Transformation killed at field: ${fieldKey}, killValue: ${derivedValue.value}`
        );
        return {
          isKilled: true,
          field: fieldKey,
          fieldValue: derivedValue.value,
        };
      }

      /** if all good, then setting this fieldValue */
      transformed[fieldKey] = derivedValue;
    }
  }

  logger.info("Data transformation completed successfully");
  return transformed;
};
