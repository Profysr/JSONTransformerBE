/**
 * SectionRegistry.js
 * 
 * Central metadata store defining how each configuration section should be processed.
 * Driven by two main scopes: 'global' (single object) and 'collection' (array of objects).
 */

export const SectionRegistry = {
    // ========================================
    // GLOBAL SECTIONS (Root-level values)
    // ========================================

    // ========================================
    // COLLECTION SECTIONS (Mapped to arrays)
    // ========================================

    readCodes: {
        processingScope: "collection",
        inputPath: "letter_codes_list",      // Array in input JSON to seed items
        outputPath: "letter_codes_list",     // Output array destination
        itemKey: "child",                    // Unique identifier for matching items
        tables: ["specific_codes"],          // Internal tables to process/merge

        // Global skip field: if false, return empty array
        globalSkipField: "add_readcodes",

        // Specialized logic for the 'specific_codes' table
        rowProcessor: "specificCodesRowProcessor",
        skipField: "addCode",                // Column in specific_codes to trigger skip/remove

        // Global rules evaluated once per section (at root context)
        generalRules: [],

        // Output template (Strict structure definition)
        outputTemplate: {
            c_term: { field: "c_term" },
            addDate: {
                field: "add_date",
                transform: ["toBoolean", "toString"]
            },
            read_code_date: { field: "read_code_date" },
            child: { field: "child" },
            code_type: { field: "code_type" },
            comments: { field: "comments" },

            // Conditional fields
            attach_problems: {
                field: "attach_problems",
                condition: "context.code_type === 'diagnosis'"
            },
            create_problems: {
                field: "create_problems",
                condition: "context.code_type === 'diagnosis'"
            },

            // Mapped fields
            problem_severity: {
                field: "isMajor",
                transform: "mapSeverity"
            },

            // Global fields passed through via context
            use_inactive: { field: "use_inactive" },
            override_bilateral: { field: "override_bilateral" },
            search_codes_in_problems: { field: "search_codes_in_problems" }
        },
    },

    metrics: {
        processingScope: "collection",
        inputPath: "metrics",                // Object in input JSON (not array)
        outputPath: "metrics",               // Output as array of objects
        itemKey: "metricName",               // Identifier (e.g. 'bp_systolic') - supports split items
        tables: ["metrics_list"],            // Table drives item generation

        // Don't seed from input - build from table only
        seedFromInput: false,

        // The 'metrics_list' table in config drives the item generation
        rowProcessor: "metricsRowProcessor",
        skipField: "add_metric",             // Column in metrics_list to trigger skip

        // Special case handlers (e.g. for BP splitting)
        specialCases: {
            "blood_pressure": "splitBP",
            "bp": "splitBP"
        },

        // Final shape of each metric item
        outputTemplate: {
            c_term: { field: "metricName" },
            value: {
                field: "rawValue",
                transform: "extractNumeric"
            },
            addDate: {
                field: "add_date",
                transform: ["toBoolean", "toString"]
            },
            read_code_date: { field: "date_type" },
            child: { field: "metric_codes" },
            code_type: "metrics"
        }
    }
};
