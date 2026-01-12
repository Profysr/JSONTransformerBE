import logger from "../../lib/logger.js";
import { processTableRules } from "../tableProcessor.js";

// ============================================
// HELPER FUNCTIONS
// ============================================

// Extract numeric values from metric strings (e.g., "120 mg" -> "120")
const extractNumeric = (val) => {
    if (typeof val !== "string") return val;
    const match = val.match(/-?\d+(\.\d+)?/g);
    return match ? match.join("/") : "";
};

// Split Blood Pressure into systolic and diastolic items
const splitBP = (metricName, rawValue, codes, row, addDate, metricDate) => {
    logger.info(`[Metrics][${metricName}] Splitting BP into systolic/diastolic...`);

    const values = String(rawValue).split("/");
    const codesList = String(codes || "").split("/");

    return [
        createMetricObj("bp_systolic", values[0], codesList[0], row, addDate, metricDate),
        createMetricObj("bp_diastolic", values[1], codesList[1] || codesList[0], row, addDate, metricDate)
    ];
};

// Build metric object with explicit field mapping
const createMetricObj = (name, val, code, row, addDate, metricDate) => {
    const obj = {
        c_term: name,
        value: extractNumeric(val) || "",
        addDate: addDate ? "true" : "false",
        read_code_date: metricDate || null,
        child: code,
    };

    // Pass through any additional fields from row (excluding internal fields)
    Object.keys(row).forEach(key => {
        if (["metric", "add_metric", "add_date", "date_type", "metric_codes", "id", "value"].includes(key)) return;
        obj[key] = row[key];
    });

    return obj;
};

// ============================================
// MAIN HANDLER
// ============================================

export const processMetrics = (inputData, rules) => {
    logger.info(`[Metrics] Starting transformation...`);

    const metricsTable = rules.metrics_list || {};
    const inputMetrics = inputData.metrics || {};

    // Process metrics_list table with explicit row processing
    const results = processTableRules(inputData, metricsTable, {
        sectionKey: "Metrics",
        skipField: "add_metric",
        identifierKey: "metric",
        onRowProcess: (row, inputData, { index }) => {
            const metricName = row.metric;
            if (!metricName) return null;

            // Find matching metric in input data (case-insensitive)
            const metricKey = Object.keys(inputMetrics).find(
                (k) => k.toLowerCase() === metricName.toLowerCase()
            );

            if (!metricKey) {
                logger.warn(`[Metrics] Metric '${metricName}' not found in input data. Skipping.`);
                return null;
            }

            const rawValue = inputMetrics[metricKey];
            const addDate = row.add_date === true || row.add_date === "true";
            const metricDate = addDate ? row.date_type : null;

            // Check if this is a Blood Pressure metric
            const isBP = ["blood_pressure", "bp"].includes(metricName.toLowerCase());

            if (isBP) {
                // Return array of two items (systolic + diastolic)
                return splitBP(metricName, rawValue, row.metric_codes, row, addDate, metricDate);
            } else {
                // Return single metric item
                logger.info(`[Metrics][${metricName}] Processing with value: ${rawValue}`);
                return createMetricObj(metricName, rawValue, row.metric_codes, row, addDate, metricDate);
            }
        }
    });

    // Check for KILL scenario
    if (results && results.isKilled) {
        return results;
    }

    // Update inputData with transformed metrics
    inputData.metrics = results;
    logger.info(`[Metrics] Completed. Total items: ${results.length}`);

    return inputData;
};
