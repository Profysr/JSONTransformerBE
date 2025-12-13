import { evaluateCondition } from "../lib/evaluateConditions.js";
import logger from "../lib/logger.js";

/**
 * Helper to evaluate a list of rules based on logic type (AND/OR).
 */
const evaluateRuleList = (data, rules, logicType, ruleKey) => {
  if (!rules || rules.length === 0) { 
    logger.error(`[${ruleKey}] No rules found for key: ${ruleKey}`); 
    return false 
  }; // Empty rules? Assume true or handle differently.

  const result = logicType === "OR"
    ? rules.some((rule) => evaluateRuleRecursive(data, rule, ruleKey))
    : rules.every((rule) => evaluateRuleRecursive(data, rule, ruleKey));

  return result;
};

/**
 * Recursive function to evaluate a single rule or a group of rules.
 */
const evaluateRuleRecursive = (data, rule, ruleKey) => {
  if (rule?.type === "group") {
    logger.info(`[${ruleKey}] Evaluating Group (Logic: ${rule.logicType})`);
    return evaluateRuleList(data, rule.rules, rule.logicType, ruleKey);
  }

  // Otherwise, treat as a condition
  const conditionId = rule.id || 'unknown-id';
  const result = evaluateCondition(data, rule, ruleKey);
  logger.info(`[${ruleKey}] Condition ${conditionId} (${rule.field} ${rule.operator} ${rule.value}) result: ${result}`);
  return result;
};

/**
 * Evaluates a cascading-advanced configuration against the input data.
 */
const evaluateCascadingAdvanced = (data, config, ruleKey) => {
  for (const [index, clause] of config.clauses.entries()) {

    logger.info(`[${ruleKey}] Evaluating Clause ${index + 1} (RootLogic: ${clause.rootLogicType})`);

    let rulesMatch = evaluateRuleList(data, clause.rules, clause.rootLogicType, ruleKey);

    if (rulesMatch) {
      let isKilled = clause.isKilled === true;

      logger.info(
        `[${ruleKey}] Rule MATCHED at Clause ${index + 1}.`
      );

      return {
        value: clause.thenValue,
        isKilled,
      };
    } else {
      logger.info(
        `[${ruleKey}] Rule NOT MATCHED at Clause ${index + 1}.`
      );
    }
  }

  const isKilledByElse = config.isKilled === true;
  logger.info(
    `[${ruleKey}] No condition satisfied, using elseValue - ${config.elseValue}.`
  );
  return {
    value: config.elseValue,
    isKilled: isKilledByElse,
  };
};

/**
 * A central function to process and apply any single rule configuration item.
 */
const applyRule = (data, ruleValue, ruleKey) => {
  // 1. Check if the ruleValue is a cascading-advanced configuration
  if (
    typeof ruleValue === "object" &&
    ruleValue !== null &&
    ruleValue.type === "cascading-advanced"
  ) {
    logger.info(`[${ruleKey}] Evaluating cascading-advanced condition rule`);

    const result = evaluateCascadingAdvanced(data, ruleValue, ruleKey);

    if (result.isKilled) {
      return { value: result.value, isKilled: true };
    }
    return result.value;
  }

  // 2. Check if the ruleValue is a variable
  if (typeof ruleValue === "string" && ruleValue.startsWith("var(")) {
    const varMatch = ruleValue.match(/^var\((.+)\)$/);
    if (varMatch && varMatch[1]) {
      const sourceField = varMatch[1];
      logger.info(`[${ruleKey}] Mapping ${ruleKey} using ${sourceField}`);
      return data[sourceField];
    }
  }

  // 3. Return the ruleValue as it is
  logger.info(`Adding '${ruleKey}' using static value: '${ruleValue}'`);
  return ruleValue;
};

/**
 * Transforms the input data based on the defined rules in MappingCONFIG.
 */
export const transformData = (input, configRules) => {
  logger.info("Starting data transformation");
  const transformed = { ...input };

  for (const [sectionKey, sectionConfig] of Object.entries(configRules)) {
    if (
      typeof sectionConfig !== "object" ||
      sectionConfig === null ||
      Array.isArray(sectionConfig)
    ) {
      continue;
    }

    for (const [fieldKey, ruleValue] of Object.entries(sectionConfig)) {
      const derivedValue = applyRule(transformed, ruleValue, fieldKey);

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
          sourceField: fieldKey,
          killValue: derivedValue.value,
          data: transformed,
        };
      }

      transformed[fieldKey] = derivedValue;
    }
  }

  logger.info("Data transformation completed successfully");
  return transformed;
};
