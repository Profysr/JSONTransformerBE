import logger from "../../lib/logger.js";
import { applyRule } from "../ApplyRule.js";
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

export const processMetrics = (inputData, rules, context) => {
    logger.info(`[Metrics] Starting transformation...`);

    // Step 1: Evaluate add_metrics toggle
    let useMetrics = context.getCandidate("add_metrics");

    if (useMetrics === undefined) {
        useMetrics = applyRule(inputData, rules.add_metrics, "add_metrics");
    } else {
        logger.info(`[Metrics] Using context override for add_metrics: ${useMetrics}`);
    }

    if (useMetrics !== null && typeof useMetrics === "object" && useMetrics.isKilled === true) {
        logger.warn(`[Metrics] add_metrics toggle triggered KILL`);
        context.setKilled({
            ...useMetrics,
            isKilled: true,
            field: "add_metrics",
        });
        return;
    }

    if (useMetrics === "false" || useMetrics === false) {
        logger.info(`[Metrics] Skipping metrics section due to toggle (add_metrics = ${useMetrics})`);
        context.addCandidate("metrics", "", "section:metrics (skip)");
        return;
    }

    const metricsTable = rules.metrics_list || {};
    const inputMetrics = (inputData.output?.metrics) || (inputData.metrics) || {};

    // Step 2: Pre-process rows for Blood Pressure to expose variables to advanced logic
    const preparedRows = (metricsTable.value || []).map(row => {
        const metricName = row.metric;
        if (metricName && ["blood_pressure", "bp"].includes(metricName.toLowerCase())) {
            const metricKey = Object.keys(inputMetrics).find(
                (k) => k.toLowerCase() === metricName.toLowerCase()
            );
            if (metricKey) {
                const rawValue = inputMetrics[metricKey];
                const values = String(rawValue).split("/").map(v => v.trim());
                return {
                    ...row,
                    bp_systolic: values[0] || "",
                    bp_diastolic: values[1] || ""
                };
            }
        }
        return row;
    });

    const preparedTable = { ...metricsTable, value: preparedRows };

    // Process metrics_list table with explicit row processing
    const results = processTableRules(inputData, preparedTable, {
        sectionKey: "Metrics",
        skipField: "add_metric",
        identifierKey: "metric",
        context, // Pass the context
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
        context.setKilled(results);
        return;
    }

    // Add to Context Candidates
    if (results && results.length > 0) {
        context.addCandidate("metrics", results, "section:metrics");
        logger.info(`[Metrics] Added ${results.length} metrics to candidates.`);
    }
};
