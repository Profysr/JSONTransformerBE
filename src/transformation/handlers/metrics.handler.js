import logger from "../../shared/logger.js";
import { applyTemplate } from "../engineFunctions/TemplateEngine.js";
import { processTableRules } from "../evaluators/tableProcessor.js";


// ==================
// 1 Split Blood Pressure into systolic and diastolic items
// ==================
// Split Blood Pressure into systolic and diastolic items
const splitBP = (
  metricName,
  rawValue,
  codes,
  row,
  rules,
  context,
  logPrefix = null,
) => {
  logger.info(
    "Splitting Blood Pressure into separate systolic and diastolic items.",
    { sectionKey: "metrics_config_rules", functionName: "splitBP", fieldKey: metricName }
  );

  const values = String(rawValue).split("/");
  const codesList = String(codes || "").split("/");

  const systolicContext = {
    ...row,
    metricName: "bp_systolic",
    rawValue: values[0] || "",
    metric_codes: codesList[0] || "",
  };

  const diastolicContext = {
    ...row,
    metricName: "bp_diastolic",
    rawValue: values[1] || "",
    metric_codes: codesList[1] || codesList[0] || "",
  };

  return [
    createMetricObj(systolicContext, rules, context, logPrefix),
    createMetricObj(diastolicContext, rules, context, logPrefix),
  ];
};

// ==================
// 2- Build metric object with explicit field mapping
// ==================

const createMetricObj = (rowContext, rules, context, logPrefix = null) => {
  const defaultTemplate = {
    metric_name: { field: "metricName" },
    value: {
      field: "rawValue",
      transform: "extractNumeric",
    },
    add_metric_date: {
      field: "add_metric_date",
      transform: ["toBoolean", "toString"],
    },
    metric_date: {
      field: "metrics_date_type",
      condition: {
        field: "add_metric_date",
        operator: "equals",
        value: "true",
      },
    },
    child: { field: "metric_codes" },
  };

  const result = applyTemplate(defaultTemplate, rowContext, context, logPrefix);
  return result;
};

// ==================
// 3 Pre-processes rows for Blood Pressure to expose variables to advanced logic
// ==================

const prepareMetricsRows = (metricsTableValue, inputMetrics) => {
  return (metricsTableValue || []).map((row) => {
    const metricName = row.metric;
    if (
      metricName &&
      ["blood_pressure", "bp"].includes(metricName.toLowerCase())
    ) {
      const metricKey = Object.keys(inputMetrics).find(
        (k) => k.toLowerCase() === metricName.toLowerCase(),
      );
      if (metricKey) {
        const rawValue = inputMetrics[metricKey];
        const values = String(rawValue)
          .split("/")
          .map((v) => v.trim());
        return {
          ...row,
          bp_systolic: values[0] || "",
          bp_diastolic: values[1] || "",
        };
      }
    }
    return row;
  });
};

// ==================
// 4 Executes the core metric transformation logic for a single row
// ==================

const executeMetricTransformation = (
  processedRow,
  inputData,
  inputMetrics,
  context,
  rules,
) => {
  const metricName = processedRow.metric;
  if (!metricName) return null;

  // Find matching metric in input data (case-insensitive)
  const metricKey = Object.keys(inputMetrics).find(
    (k) => k.toLowerCase() === metricName.toLowerCase(),
  );

  if (!metricKey) {
    logger.warn(
      "Metric not found in patient data. Skipping.",
      { sectionKey: "metrics_config_rules", functionName: "executeMetricTransformation", fieldKey: metricName }
    );
    return null;
  }

  const rawValue = inputMetrics[metricKey];

  const rowContext = {
    ...processedRow,
    metricName,
    rawValue,
    metric_codes: processedRow.metric_codes,
    add_metric_date: processedRow.add_metric_date,
    metrics_date_type: processedRow.metrics_date_type,
  };

  const isBP = metricName?.toLowerCase() === "bp" || metricName?.toLowerCase() === "blood_pressure";

  if (isBP) {
    return splitBP(
      metricName,
      rawValue,
      processedRow.metric_codes,
      processedRow,
      rules,
      context,
    );
  } else {
    logger.info(`Metric evaluated with value: ${rawValue}`, { sectionKey: "metrics_config_rules", functionName: "executeMetricTransformation", fieldKey: metricName });
    return createMetricObj(
      rowContext,
      rules,
      context,
    );
  }
};

// ==================
// 5 Main Handler
// ==================
export const processMetrics = (inputData, rules, context) => {
  const metricsTable = rules.metrics_list || {};
  const inputMetrics = inputData.output?.metrics || inputData.metrics || {};

  // 1. Pre-process rows
  metricsTable.value = prepareMetricsRows(metricsTable.value, inputMetrics);

  // 2. Process metrics_list table
  const results = processTableRules(inputData, metricsTable, {
    sectionKey: "Metrics",
    context,
    onRowProcess: (processedRow, inputData) => {
      return executeMetricTransformation(
        processedRow,
        inputData,
        inputMetrics,
        context,
        rules,
      );
    },
  });

  if (results && results.isKilled) {
    context.setKilled(results);
    return;
  }

  context.addCandidate("metrics", results || [], "section:metrics");
  logger.info(
    `Finished processing. Total metrics identified: ${results?.length || 0}`,
    { sectionKey: "metrics_config_rules", functionName: "processMetrics" }
  );
};
