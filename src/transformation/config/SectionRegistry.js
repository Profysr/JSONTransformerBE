/**
 * SectionRegistry.js
 * 
 * Central metadata store defining how each configuration section should be processed.
 * This is the ONLY place where section-specific behavior is defined.
 * 
 * Adding a new section = adding metadata here. No code changes needed.
 */

export const SectionRegistry = {
    // ========================================
    // GLOBAL SECTIONS
    // ========================================

    letter_type_configuration: {
        processingScope: "global",
        outputPath: null,  // Merge into root output
        fieldMappings: {},
        excludeFields: []
    },

    rpa_note_checks: {
        processingScope: "global",
        outputPath: null,  // Merge into root
        fieldMappings: {},
        excludeFields: []
    },

    forward_letter: {
        processingScope: "global",
        outputPath: null,  // Merge into root
        fieldMappings: {},
        excludeFields: []
    },

    // ========================================
    // COLLECTION SECTIONS (Input-Driven)
    // ========================================

    readCodes: {
        processingScope: "collection",
        inputPath: "letter_codes_list",      // Where to find input data
        outputPath: "readCodes",              // Where to store result
        itemKey: "child",                     // Unique identifier for logging

        // Global rules (extracted separately from collection processing)
        globalRules: ["use_inactive", "override_bilateral", "search_codes_in_problems"],

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

        // Secondary rules to merge (e.g., optional_codes)
        secondaryRules: ["optional_codes"]
    },

    // ========================================
    // TABLE SECTIONS (Config-Driven)
    // ========================================

    metrics: {
        processingScope: "table",
        configPath: "metrics_list",           // Table in config to iterate
        inputPath: "metrics",                 // Where to find input values
        outputPath: "metrics",                // Where to store result
        matchStrategy: "caseInsensitiveKey",  // How to match config row to input

        // Row processor function name
        rowProcessor: "metricsRowProcessor",

        // Special case handlers
        specialCases: {
            "blood_pressure": "splitBP",
            "bp": "splitBP"
        },

        // Output template for standard metrics
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
        },

        // Fields to exclude from pass-through
        excludeFields: ["metric", "add_metric", "add_date", "date_type", "metric_codes", "id", "value"]
    },

    // ========================================
    // SECONDARY RULES (Merged into other sections)
    // ========================================

    optional_codes: {
        processingScope: "secondary",
        targetSection: "readCodes",  // Merge into this section
        tables: ["specific_problem_links", "specific_read_codes"]
    }
};
