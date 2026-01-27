import logger from "../../lib/logger.js";
import { processTableRules } from "../Evaluators/tableProcessor.js";
import { applyTemplate } from "../Evaluators/TemplateEngine.js";

// ============================================
// HELPER FUNCTIONS
// ============================================

// Split Blood Pressure into systolic and diastolic items
const splitBP = (metricName, rawValue, codes, row, rules, context) => {
    logger.info(`[Metrics][${metricName}] Splitting BP into systolic/diastolic...`);

    const values = String(rawValue).split("/");
    const codesList = String(codes || "").split("/");

    const systolicContext = {
        ...row,
        metricName: "bp_systolic",
        rawValue: values[0] || "",
        metric_codes: codesList[0] || ""
    };

    const diastolicContext = {
        ...row,
        metricName: "bp_diastolic",
        rawValue: values[1] || "",
        metric_codes: codesList[1] || codesList[0] || ""
    };

    return [
        createMetricObj(systolicContext, rules, context),
        createMetricObj(diastolicContext, rules, context)
    ];
};

// Build metric object with explicit field mapping
const createMetricObj = (rowContext, rules, context) => {
    // Standard Metrics Template
    const defaultTemplate = {
        cTerm: { field: "metricName" },
        value: {
            field: "rawValue",
            transform: "extractNumeric"
        },
        addDate: {
            field: "add_date",
            transform: ["toBoolean", "toString"]
        },
        metricDate: { field: "date_type", condition: { field: "add_date", operator: "equals", value: "true" } },
        child: { field: "metric_codes" },
        // Pass through any additional fields from row
        // ...Object.keys(rowContext).reduce((acc, key) => {
        //     if (!["metricName", "rawValue", "metric_codes", "add_date", "date_type", "metric", "add_metric", "id", "value"].includes(key)) {
        //         acc[key] = { field: key };
        //     }
        //     return acc;
        // }, {})
    };

    const result = applyTemplate(defaultTemplate, rowContext, context);
    return result;
};

// ============================================
// MAIN HANDLER
// ============================================

export const processMetrics = (inputData, rules, context) => {
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

    // Step 3: Process metrics_list table with explicit row processing
    const results = processTableRules(inputData, preparedTable, {
        sectionKey: "Metrics",
        skipField: "add_metric",
        identifierKey: "metric",
        context, // Pass the context
        onRowProcess: (processedRow, inputData, { index }) => {
            const metricName = processedRow.metric;
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

            // Prepare context for Template Engine - use processed fields (e.g. for evaluated add_date)
            const rowContext = {
                ...processedRow,
                metricName,
                rawValue,
                metric_codes: processedRow.metric_codes,
                add_date: processedRow.add_date,
                date_type: processedRow.date_type
            };

            // Check if this is a Blood Pressure metric
            const isBP = ["blood_pressure", "bp"].includes(metricName.toLowerCase());

            if (isBP) {
                // Return array of two items (systolic + diastolic)
                return splitBP(metricName, rawValue, processedRow.metric_codes, processedRow, rules, context);
            } else {
                // Return single metric item
                logger.info(`[Metrics][${metricName}] Processing with value: ${rawValue}`);
                return createMetricObj(rowContext, rules, context);
            }
        }
    });

    // Check for KILL scenario
    if (results && results.isKilled) {
        context.setKilled(results);
        return;
    }

    // Add to Context Candidates (Always add even if empty as per requirement)
    context.addCandidate("metrics", results || [], "section:metrics");
    logger.info(`[Metrics] Added ${results?.length || 0} metrics to candidates.`);
};
