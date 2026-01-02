import logger from "../lib/logger.js";
import { applyRule } from "./ruleApplier.js";

export const processMetricsRules = (data, rules) => {

    const transformedMetrics = [];
    const metricsList = rules.metrics_list?.value || [];
    const columnsMeta = rules.metrics_list?.columns || [];
    const inputMetrics = data.metrics || {};

    logger.info(
        `[Metrics] Starting metrics processing. Rows count: ${metricsList.length}, Input metrics: ${Object.keys(inputMetrics).length}`
    );

    // Validation
    if (!Array.isArray(metricsList)) {
        logger.error("[Metrics] metrics_list.value is not an array");
        return data;
    }

    if (!Array.isArray(columnsMeta)) {
        logger.warn("[Metrics] metrics_list.columns is not an array, using empty array");
    }

    // Map columns for O(1) lookup
    const metaMap = new Map(columnsMeta.map((c) => [c.key, c]));
    logger.info(`[Metrics] Loaded ${metaMap.size} column entries for validations`);

    /**
* Helper to evaluate field based on conditional metadata
*/
    const evaluateField = (fieldKey, rowValue) => {
        const meta = metaMap.get(fieldKey) || {};

        // Only apply rule if canConditional is true
        if (meta.canConditional) {
            const result = applyRule(data, rowValue, fieldKey);
            logger.info(
                `[Metrics][${fieldKey}] Conditional evaluation: ${rowValue} => ${result}`
            );
            return result;
        }

        // Return raw value if not conditional
        return rowValue;
    };

    /**
     * Helper to extract numeric values from strings
     */
    const extractNumeric = (val) => {
        if (typeof val !== "string") return val;
        const match = val.match(/-?\d+(\.\d+)?/g);
        return match ? match.join("/") : "";
    };
    
    for (const [index, row] of metricsList.entries()) {
        try {
            const metricName = row.metric;
            if (!metricName) {
                logger.error(
                    `[Metrics][Row ${index}] Missing 'metric' property in row: ${JSON.stringify(
                        row
                    )}`
                );
                continue;
            }

            logger.info(`[Metrics][${metricName}] Processing metric (row ${index})...`);

            /** Looking if the metric is present in input JSON as we do check in our automation. if height <> 000, then add this code */
            const inputKey = Object.keys(inputMetrics).find(
                (k) => k.toLowerCase() === metricName.toLowerCase()
            );

            if (!inputKey) {
                logger.info(
                    `[Metrics][${metricName}] Metric not found in input data, skipping`
                );
                continue;
            }

            logger.info(
                `[Metrics][${metricName}] Found in input as '${inputKey}' with value: ${inputMetrics[inputKey]}`
            );

            // 1. Check if metric should be added
            const shouldAdd = evaluateField("add_metric", row.add_metric);
            if (shouldAdd !== true) {
                logger.info(
                    `[Metrics][${metricName}] Skipped due to add_metric=${shouldAdd}`
                );
                continue;
            }

            // 2. Evaluate base fields
            const rawValue = evaluateField("value", inputMetrics[inputKey]);
            const rawMetricCodes = evaluateField("metric_codes", row.metric_codes);
            const addDate = evaluateField("add_date", row.add_date) === true;
            const metricDate = addDate
                ? evaluateField("date_type", row.date_type)
                : "";

            logger.info(`[Metrics][${metricName}] Evaluated fields:`, {
                rawValue,
                rawMetricCodes,
                addDate,
                metricDate,
            });

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
            const isBP = ["blood_pressure", "bp"].includes(
                metricName.toLowerCase()
            );

            if (isBP) {
                logger.info(
                    `[Metrics][${metricName}] Detected blood pressure, splitting into systolic/diastolic`
                );

                const values = String(rawValue).split("/");
                const codes = String(rawMetricCodes).split("/");

                logger.info(`[Metrics][${metricName}] Split values:`, {
                    systolic: values[0],
                    diastolic: values[1],
                    systolicCode: codes[0],
                    diastolicCode: codes[1],
                });

                // Push Systolic
                const systolicObj = createMetricObj(
                    "bp_systolic",
                    values[0],
                    codes[0]
                );
                transformedMetrics.push(systolicObj);
                logger.info(
                    `[Metrics][bp_systolic] Added: ${JSON.stringify(systolicObj)}`
                );

                // Push Diastolic
                const diastolicObj = createMetricObj(
                    "bp_diastolic",
                    values[1],
                    codes[1] || codes[0]
                );
                transformedMetrics.push(diastolicObj);
                logger.info(
                    `[Metrics][bp_diastolic] Added: ${JSON.stringify(diastolicObj)}`
                );
            } else {
                // Standard Metric
                const metricObj = createMetricObj(
                    metricName,
                    rawValue,
                    rawMetricCodes
                );
                transformedMetrics.push(metricObj);
                logger.info(
                    `[Metrics][${metricName}] Added: ${JSON.stringify(metricObj)}`
                );
            }
        } catch (error) {
            logger.error(`[Metrics][Row ${index}] Error processing metric row:`, {
                error: error.message,
                stack: error.stack,
                row: row,
            });
            // Continue processing other metrics
        }
    }

    data.metrics = transformedMetrics;
    logger.info(
        `[Metrics] Completed processing. Total metrics in output: ${transformedMetrics.length}`
    );

    return data;
};
