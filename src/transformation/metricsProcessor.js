import logger from "../lib/logger.js";
import { processTableRules } from "./tableProcessor.js";

/** Helper to extract numeric values from strings */
const extractNumeric = (val) => {
    if (typeof val !== "string") return val;
    const match = val.match(/-?\d+(\.\d+)?/g);
    return match ? match.join("/") : "";
};

export const processMetricsRules = (inputData, rules) => {
    const metricsRules = rules.metrics_list || {};
    const receivedMetrics = inputData.metrics || {};

    const result = processTableRules(inputData, metricsRules, {
        sectionKey: "Metrics",
        skipField: "add_metric",
        onRowProcess: (row, inputData, { index }) => {
            const metricName = row.metric;
            if (!metricName) return null;

            /** Same check as we do if bmi is present, then add it. */
            const inputMetric = Object.keys(receivedMetrics).find(
                (k) => k.toLowerCase() === metricName.toLowerCase()
            );

            if (!inputMetric) {
                logger.warn(`[Metrics] Metric ${metricName} not found in input data. So, ignoring it`);
                return null;
            };

            const rawValue = receivedMetrics[inputMetric];
            const addDate = row.add_date === true || row.add_date === "true";
            const metricDate = addDate ? row.date_type : "";

            /** Function to create metric object */
            const createMetricObj = (name, val, code) => {
                const obj = {
                    c_term: name,
                    value: extractNumeric(val) || "",
                    addDate: addDate ? "true" : "false",
                    read_code_date: metricDate || null,
                    child: code || "",
                    code_type: "metrics",
                };

                /** Removing row specific fields and create our customized object for metrics */
                Object.keys(row).forEach(key => {
                    if (["metric", "add_metric", "add_date", "date_type", "metric_codes", "id", "value"].includes(key)) return;
                    obj[key] = row[key];
                });

                return obj;
            };

            const isBP = ["blood_pressure", "bp"].includes(metricName.toLowerCase());

            if (isBP) {
                logger.info(`[Metrics][${metricName}] Processing BP - splitting into systolic/diastolic...`);
                const values = String(rawValue).split("/");
                const codes = String(row.metric_codes || "").split("/");

                return [
                    createMetricObj("bp_systolic", values[0], codes[0]),
                    createMetricObj("bp_diastolic", values[1], codes[1] || codes[0])
                ];
            } else {
                logger.info(`[Metrics][${metricName}] Processing metric with value: ${rawValue}`);
                return createMetricObj(metricName, rawValue, row.metric_codes);
            }
        }
    });

    // Check for kill scenario from table processor
    if (result && result.isKilled) {
        return result;
    }

    inputData.metrics = result;
    logger.info(`[Metrics] Completed. Total items: ${result.length}`);
    return inputData;
};
