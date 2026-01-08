import logger from "../../lib/logger.js";

const SpecialHandlers = {
    /**
     * Split Blood Pressure into systolic and diastolic items
     */
    splitBP: (configRow, rawValue, meta) => {
        const values = String(rawValue || "").split("/");
        const codes = String(configRow.metric_codes || "").split("/");

        const systolicContext = {
            ...configRow,
            metricName: "bp_systolic",
            rawValue: values[0] || "",
            metric_codes: codes[0] || ""
        };

        const diastolicContext = {
            ...configRow,
            metricName: "bp_diastolic",
            rawValue: values[1] || "",
            metric_codes: codes[1] || codes[0] || ""
        };

        return [systolicContext, diastolicContext];
    }
};

export const RowProcessors = {
    /**
     * Metrics Row Processor
     * Matches a config row against the input 'metrics' object.
     */
    metricsRowProcessor: (configRow, metricsContext, meta) => {
        // 1. Skip check (Special Operation)
        if (meta.skipField && configRow[meta.skipField] !== undefined) {
            const skipVal = configRow[meta.skipField];
            if (skipVal === false || skipVal === "false") return null;
        }

        const metricName = configRow.metric;
        if (!metricName) return null;

        // Metrics context is the full metrics object
        const inputKey = Object.keys(metricsContext || {}).find(
            k => k.toLowerCase() === metricName.toLowerCase()
        );

        if (!inputKey) {
            logger.info(`[RowProcessor][Metrics][${metricName}] Not found in input. Skipping.`);
            return null;
        }

        const rawValue = metricsContext[inputKey];

        // Check for special case handler (e.g., BP split)
        const specialHandler = meta.specialCases?.[metricName.toLowerCase()];
        if (specialHandler && SpecialHandlers[specialHandler]) {
            return SpecialHandlers[specialHandler](configRow, rawValue, meta);
        }

        // Return raw item for template application
        return {
            ...configRow,
            metricName,
            rawValue
        };
    },

    /**
     * Specific Codes Row Processor
     * Handles adding/removing codes from letter_codes_list based on addCode field.
     */
    specificCodesRowProcessor: (configRow, itemContext, meta) => {
        // 1. Skip check: If addCode is false, signal removal
        if (meta.skipField && configRow[meta.skipField] !== undefined) {
            const skipVal = configRow[meta.skipField];
            if (skipVal === false || skipVal === "false") {
                // Return removal signal with identifier
                return {
                    _remove: true,
                    identifier: configRow[meta.itemKey] || configRow.child
                };
            }
        }

        // 2. If addCode is true, merge config data into existing item or create new
        // itemContext is either the existing item from letter_codes_list or undefined
        return {
            ...itemContext,
            ...configRow
        };
    }
};
