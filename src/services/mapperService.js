import { evaluateCondition } from "../lib/evaluateConditions.js";
import logger from "../lib/logger.js"; // Import your logger

/**
 * Evaluates a cascading-advanced configuration against the input data.
 */
const evaluateCascadingAdvanced = (data, config, ruleKey) => {
  for (const clause of config.clauses) {
    let rulesMatch = false;
    let logicTypeApplied = clause.rootLogicType;

    if (clause.rules.length === 1) {
      rulesMatch = evaluateCondition(data, clause.rules[0]);
      logicTypeApplied = "SINGLE_RULE";
    }

    if (clause.rules.length !== 1) {
      if (clause.rootLogicType === "AND") {
        rulesMatch = clause.rules.every((rule) => evaluateCondition(data, rule));
      } else if (clause.rootLogicType === "OR") {
        rulesMatch = clause.rules.some((rule) => evaluateCondition(data, rule));
      }
    }

    if (rulesMatch) {
      let isKilled = clause.isKilled === true;

      logger.info(
        `CASCADING_ADVANCED_CONDITION_SATISFIED: Rule '${ruleKey}' matched with logic type '${logicTypeApplied}'.`
      );

      return {
        value: clause.thenValue,
        isKilled,
      };
    }
  }

  const isKilledByElse = config.isKilled === true;
  logger.info(
    `No condition satisfied for key ${ruleKey}, using elseValue.`
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
    logger.info(
      `Evaluating cascading-advanced condition rule for key: ${ruleKey}`
    );

    const result = evaluateCascadingAdvanced(data, ruleValue, ruleKey);

    if (result.isKilled) {
      // logger.warn(`Rule killed for key: ${ruleKey}, value: ${result.value}`);
      return { value: result.value, isKilled: true };
    }
    return result.value;
  }

  // 2. Check if the ruleValue is a variable
  if (typeof ruleValue === "string" && ruleValue.startsWith("var(")) {
    const varMatch = ruleValue.match(/^var\((.+)\)$/);
    if (varMatch && varMatch[1]) {
      const sourceField = varMatch[1];
      logger.info(
        `Mapping ${ruleKey} using ${sourceField}`
      );
      return data[sourceField];
    }
  }

  // 3. Return the ruleValue as is
  logger.info(`Adding '${ruleKey}' using static value: '${ruleValue}' in JSON`);
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
          `Transformation killed at field: ${fieldKey}, killValue: ${derivedValue.value}`
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
