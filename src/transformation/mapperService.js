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
      `[${fieldKey}] Evaluating Clause ${index + 1} (RootLogic: ${clause.rootLogicType
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
      let isKilled = clause.outcome?.isKilled === true;
      logger.info(`[${fieldKey}] Condition satisfied at Clause ${index + 1}.`);
      return {
        value: clause.outcome?.value,
        isKilled,
      };
    } else {
      logger.info(
        `[${fieldKey}] Condition didn't satisfied at Clause ${index + 1}.`
      );
    }
  }

  /** if there's no condition match, simply extract the elseVal from config and return it */
  const isKilled = config.else?.isKilled === true;
  logger.info(
    `[${fieldKey}] No condition satisfied, using elseValue - ${config.else?.value}.`
  );
  return {
    value: config.else?.value,
    isKilled: isKilled,
  };
};

/**
 * Processes general top-level rules.
 */
const processGeneralRules = (data, rules) => {
  for (const [fieldKey, fieldValue] of Object.entries(rules)) {
    const derivedValue = applyRule(data, fieldValue, fieldKey);

    if (
      typeof derivedValue === "object" &&
      derivedValue !== null &&
      derivedValue.isKilled === true
    ) {
      return { isKilled: true, field: fieldKey, value: derivedValue.value, data: data };
    }
    data[fieldKey] = derivedValue;
  }
  return data;
};

/**
 * Processes metrics rules (granular level).
 * Logic placeholder for now as per user request.
 */
const processMetricsRules = (data, rules) => {
  const transformedMetrics = [];
  const metricsList = rules.metrics_list?.value || [];
  const columnsMeta = rules.metrics_list?.columns || [];
  const inputMetrics = data.metrics || {};

  // Map columns for O(1) lookup
  const metaMap = new Map(columnsMeta.map(c => [c.key, c]));

  const evaluateField = (fieldKey, rowValue) => {
    const meta = metaMap.get(fieldKey) || {};
    return meta.canConditional ? applyRule(data, rowValue, fieldKey) : rowValue;
  };

  const extractNumeric = (val) => {
    if (typeof val !== "string") return val;
    const match = val.match(/-?\d+(\.\d+)?/g);
    return match ? match.join("/") : "";
  };

  logger.info(`Processing ${metricsList.length} metrics rules.`);

  for (const row of metricsList) {
    const metricName = row.metric;
    if (!metricName) {
      logger.error(`metric property is missing in ${JSON.stringify(row)}`);
      continue;
    }

    // Case-insensitive input lookup
    const inputKey = Object.keys(inputMetrics).find(
      (k) => k.toLowerCase() === metricName.toLowerCase()
    );

    if (!inputKey) {
      logger.info(`Metric ${metricName} not found in input data.`);
      continue;
    }

    // 1. Check if metric should be added
    if (evaluateField("add_metric", row.add_metric) !== true) {
      logger.info(`Metric ${metricName} skipped.`);
      continue;
    }

    // 2. Evaluate base fields
    const rawValue = evaluateField("value", inputMetrics[inputKey]);
    const rawMetricCodes = evaluateField("metric_codes", row.metric_codes);
    const addDate = evaluateField("add_date", row.add_date) === true;
    const metricDate = addDate ? evaluateField("date_type", row.date_type) : "";

    // Common object factory to maintain "flattened" structure
    const createMetricObj = (name, val, code) => ({
      metric: name, // Metric name is now a property
      value: extractNumeric(val) || "",
      addDate: addDate ? "true" : "false",
      metric_date: metricDate || "",
      metric_codes: code || "",
      comments: "",
    });

    // 3. Handle Blood Pressure Splitting Logic
    const isBP = ["blood_pressure", "bp"].includes(metricName.toLowerCase());

    if (isBP) {
      const values = String(rawValue).split("/");
      const codes = String(rawMetricCodes).split("/");

      // Push Systolic
      transformedMetrics.push(createMetricObj("bp_systolic", values[0], codes[0]));
      // Push Diastolic
      transformedMetrics.push(createMetricObj("bp_diastolic", values[1], codes[1] || codes[0]));
    } else {
      // Standard Metric
      transformedMetrics.push(createMetricObj(metricName, rawValue, rawMetricCodes));
    }
  }

  data.metrics = transformedMetrics;
  return data;
};




/**
 * Processes readCodes and optionalCodes (granular level).
 * Logic placeholder for now as per user request.
 */
const processReadCodesRules = (data, rules) => {
  // Basic implementation to be expanded later
  return data;
};

/**
 * A central function to process and apply any configurations rules on the data.
 */
const applyRule = (data, fieldValue, fieldKey) => {
  if (!data) return fieldValue;

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
    /** Reason: if we set variable in our outcome_else value. We've to make sure, If not killed, use the result value as the new fieldValue and continue evaluation */
    fieldValue = result.value;
  }

  // 2. Check if the fieldValue is a variable
  if (typeof fieldValue === "string") {
    fieldValue = fieldValue.trim();

    if (fieldValue.includes("var(")) {
      const varMatch = fieldValue.match(/var\((.+)\)/);
      if (varMatch && varMatch[1]) {
        /** for example: if we set 'letter_date: var(incident_date)', then letter_date is the fieldKey and incident_date is the sourceField */
        const sourceFieldPath = varMatch[1].trim();

        // Skip self-mapping (e.g., letter_date: var(letter_date))
        if (sourceFieldPath === fieldKey) {
          logger.info(
            `[${fieldKey}] Skipping self-mapping for field: ${fieldKey}`
          );
          return fieldValue;
        }

        logger.info(`[${fieldKey}] Mapping '${fieldKey}' with '${sourceFieldPath}'`);
        return sourceFieldPath
          .split(".")
          .reduce((acc, part) => (acc ? acc[part] : undefined), data);
      }
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
export const transformerHelper = (input, configRules) => {
  let transformed = { ...input };
  logger.info(`Started JSON Transformation`);

  for (const [sectionKey, sectionRules] of Object.entries(configRules)) {
    logger.info(`Processing section: ${sectionKey}`);

    // 1. Process Metrics
    if (sectionKey === "metrics") {
      const result = processMetricsRules(transformed, sectionRules);
      if (result && result.isKilled) {
        logger.error(
          `[${result.field}] Transformation killed at metrics field: ${result.field}, killValue: ${result.value}`
        );
        logger.info("Data transformation killed. Final state:", result.data);
        return { ...result, sectionKey };
      }
      transformed = result;
    }

    // 2. Process ReadCodes & OptionalCodes
    else if (sectionKey === "readCodes" || sectionKey === "optionalCodes") {
      const result = processReadCodesRules(transformed, sectionRules);
      if (result && result.isKilled) {
        logger.error(
          `[${result.field}] Transformation killed at readcode field: ${result.field}, killValue: ${result.value}`
        );
        logger.info("Data transformation killed. Final state:", result.data);
        return { ...result, sectionKey };
      }
      transformed = result;
    }

    // 3. Default behavior for other sections
    else if (
      typeof sectionRules === "object" &&
      !Array.isArray(sectionRules) &&
      sectionRules !== null
    ) {
      const result = processGeneralRules(transformed, sectionRules);

      if (result && result.isKilled) {
        logger.error(
          `[${result.field}] Transformation killed at field: ${result.field}, killValue: ${result.value}`
        );
        logger.info("Data transformation killed. Final state:", result.data);
        return { ...result, sectionKey };
      }
      transformed = result;
    }
  }

  logger.info("Data transformation completed successfully", transformed);
  return transformed;
};


