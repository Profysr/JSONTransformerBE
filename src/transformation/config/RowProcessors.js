import logger from "../../lib/logger.js";
import { applyTemplate } from "../TemplateEngine.js";

/**
 * RowProcessors.js
 * 
 * Registry of specialized row processing functions for table-based sections.
 * Each processor handles the logic for transforming a config table row into output data.
 */

/**
 * Special Handlers for complex cases
 */
const SpecialHandlers = {
    /**
     * Split Blood Pressure into systolic and diastolic
     */
    splitBP: (configRow, rawValue, meta) => {
        const values = String(rawValue).split("/");
        const codes = String(configRow.metric_codes || "").split("/");

        const systolicContext = {
            ...configRow,
            metricName: "bp_systolic",
            rawValue: values[0],
            metric_codes: codes[0]
        };

        const diastolicContext = {
            ...configRow,
            metricName: "bp_diastolic",
            rawValue: values[1],
            metric_codes: codes[1] || codes[0]
        };

        return [
            applyTemplate(meta.outputTemplate, systolicContext),
            applyTemplate(meta.outputTemplate, diastolicContext)
        ];
    }
};

/**
 * Row Processors
 */
export const RowProcessors = {
    /**
     * Metrics Row Processor
     * Processes a single row from the 'metrics_list' configuration table.
     * 
     * @param {Object} configRow - Row from the config table
     * @param {Object} inputData - Full input data object
     * @param {Object} meta - Section metadata from SectionRegistry
     * @returns {Object|Array|null} Processed metric object(s) or null if not found
     */
    metricsRowProcessor: (configRow, inputData, meta) => {
        const metricName = configRow.metric;

        if (!metricName) {
            logger.warn(`[RowProcessor][Metrics] Row is missing 'metric' name`);
            return null;
        }

        const inputMetrics = inputData[meta.inputPath] || {};

        // Case-insensitive lookup
        const inputKey = Object.keys(inputMetrics).find(
            k => k.toLowerCase() === metricName.toLowerCase()
        );

        if (!inputKey) {
            logger.info(`[RowProcessor][Metrics][${metricName}] Not found in input data. Skipping.`);
            return null;
        }

        const rawValue = inputMetrics[inputKey];

        // Check for special case handler
        const specialHandler = meta.specialCases?.[metricName.toLowerCase()];
        if (specialHandler && SpecialHandlers[specialHandler]) {
            logger.info(`[RowProcessor][Metrics][${metricName}] Using special handler: ${specialHandler}`);
            return SpecialHandlers[specialHandler](configRow, rawValue, meta);
        }

        // Standard processing using template
        const context = {
            ...configRow,
            metricName,
            rawValue
        };

        const result = applyTemplate(meta.outputTemplate, context);

        // Pass through extra fields (excluding standard ones)
        Object.keys(configRow).forEach(key => {
            if (!meta.excludeFields.includes(key) && !(key in result)) {
                result[key] = configRow[key];
            }
        });

        logger.info(`[RowProcessor][Metrics][${metricName}] Processed with value: ${rawValue}`);
        return result;
    }
};
