import logger from "../lib/logger.js";
import { SectionRegistry } from "./config/SectionRegistry.js";
import { RowProcessors } from "./config/RowProcessors.js";
import { TransformFunctions } from "./config/TransformFunctions.js";
import { ContextChain } from "../lib/ContextChain.js";
import { applyRule } from "./ruleApplier.js";
import { processTableRules } from "./tableProcessor.js";
import { isEmpty } from "../lib/utils.js";
import { applyTemplate } from "./TemplateEngine.js";

/**
 * GenericEngine.js
 * 
 * The Universal Transformation Engine.
 * Processes all sections based on metadata from SectionRegistry.
 * NO section-specific logic here - everything is driven by metadata.
 */

/**
 * Main entry point for generic transformation
 */
export const processGeneric = (inputData, configRules) => {
    const output = {};
    const consolidatedRules = { ...configRules };

    // Step 1: Handle secondary rules (merge into target sections)
    for (const [key, rules] of Object.entries(configRules)) {
        const meta = SectionRegistry[key];

        if (meta?.processingScope === "secondary") {
            const target = meta.targetSection;
            if (consolidatedRules[target]) {
                logger.info(`[GenericEngine] Merging secondary rules from '${key}' into '${target}'`);
                consolidatedRules[target] = {
                    ...consolidatedRules[target],
                    __secondaryRules: { [key]: rules }
                };
                delete consolidatedRules[key];
            }
        }
    }

    // Step 2: Process each section
    for (const [sectionKey, rules] of Object.entries(consolidatedRules)) {
        const meta = SectionRegistry[sectionKey];

        if (!meta) {
            logger.warn(`[GenericEngine] No metadata found for section '${sectionKey}'. Skipping.`);
            continue;
        }

        logger.info(`[GenericEngine] Processing section '${sectionKey}' with scope '${meta.processingScope}'`);

        let result;

        switch (meta.processingScope) {
            case "collection":
                result = processCollection(inputData, rules, meta, sectionKey);
                break;
            case "table":
                result = processTable(inputData, rules, meta, sectionKey);
                break;
            case "global":
                result = processGlobal(inputData, rules, meta, sectionKey);
                break;
            default:
                logger.error(`[GenericEngine] Unknown processing scope: ${meta.processingScope}`);
                continue;
        }

        // Check for KILL
        if (result && result.isKilled) {
            logger.error(`[GenericEngine] Section '${sectionKey}' triggered KILL`);
            return result;
        }

        // Place result in output
        if (meta.outputPath === null) {
            // Merge into root
            Object.assign(output, result);
        } else {
            output[meta.outputPath] = result;
        }
    }

    return output;
};

/**
 * Process a COLLECTION section (Input-Driven)
 * Iterates over an array in inputData and applies rules to each item.
 */
const processCollection = (inputData, rules, meta, sectionKey) => {
    const collection = inputData[meta.inputPath] || [];

    if (!Array.isArray(collection)) {
        logger.warn(`[GenericEngine][${sectionKey}] Input path '${meta.inputPath}' is not an array`);
        return [];
    }

    logger.info(`[GenericEngine][${sectionKey}] Processing ${collection.length} items from '${meta.inputPath}'`);

    // Extract global rules first
    const globalRules = extractGlobalRules(inputData, rules, meta);

    // Initialize collection map
    const itemsMap = new Map();
    collection.forEach(item => {
        if (item[meta.itemKey]) {
            itemsMap.set(item[meta.itemKey], { ...item });
        }
    });

    // Process secondary rules (e.g., optional_codes tables)
    const pendingForcedMappings = [];
    if (rules.__secondaryRules) {
        for (const [secKey, secRules] of Object.entries(rules.__secondaryRules)) {
            logger.info(`[GenericEngine][${sectionKey}] Processing secondary rules: ${secKey}`);
            processSecondaryTables(inputData, secRules, itemsMap, meta, pendingForcedMappings);
        }
    }

    // Apply main rules to each item
    const entries = Array.from(itemsMap.entries());
    for (const [itemId, item] of entries) {
        const killResult = applyRulesToItem(inputData, item, rules, meta, sectionKey);
        if (killResult) return killResult;
    }

    // Apply forced mappings
    if (pendingForcedMappings.length > 0) {
        logger.info(`[GenericEngine][${sectionKey}] Applying ${pendingForcedMappings.length} forced mappings`);
        applyForcedMappings(itemsMap, pendingForcedMappings);
    }

    // Refine and clean items
    // Use outputTemplate if available, otherwise fallback to refineItem (legacy)
    let finalItems;
    if (meta.outputTemplate) {
        logger.info(`[GenericEngine][${sectionKey}] Applying output template...`);
        finalItems = Array.from(itemsMap.values()).map(item => {
            // Context includes item properties + globalRules + global inputData
            const context = { ...item, ...globalRules, inputData };
            return applyTemplate(meta.outputTemplate, context);
        });
    } else {
        finalItems = Array.from(itemsMap.values()).map(item => refineItem(item, meta));
    }

    // Build output structure
    // If outputStructure is NOT defined but outputTemplate IS, we might just want to return the array?
    // But readCodes specifically wanted { global_rules, letter_codes, letter_codes_list } in the past.
    // The NEW plan says: outputTemplate defines the object structure.
    // AND SectionRegistry.js removed outputStructure.
    // So for readCodes, we just return the finalItems array?
    // WAIT. The user prompt said: "Output structure for readcodes: (forget about globalRules) or these kinda things"
    // " { c_term: ... }"
    // So distinct from the "nested" structure before.
    // However, if we return just an array, does it match the key "readCodes"?
    // Yes, GenericEngine does output[meta.outputPath] = result;
    // So output.readCodes = [ ...objects... ]

    // BUT! Reviewing the plan: "SectionRegistry.js ... Remove outputStructure".
    // "GenericEngine.js ... Update processCollection... Resulting items replace the raw items list."

    // So simpler return:
    return finalItems;
};

/**
 * Process a TABLE section (Config-Driven)
 * Iterates over a config table and looks up values in inputData.
 */
const processTable = (inputData, rules, meta, sectionKey) => {
    const tableConfig = rules[meta.configPath];

    if (!tableConfig) {
        logger.warn(`[GenericEngine][${sectionKey}] Config table '${meta.configPath}' not found`);
        return [];
    }

    const result = processTableRules(inputData, tableConfig, {
        sectionKey: sectionKey,
        skipField: "add_metric",
        onRowProcess: (processedRow, inputData, extra) => {
            const processor = RowProcessors[meta.rowProcessor];
            if (processor) {
                return processor(processedRow, inputData, meta);
            }
            return processedRow;
        }
    });

    if (result && result.isKilled) return result;

    return result;
};

/**
 * Process a GLOBAL section
 * Applies rules directly to the root inputData.
 */
const processGlobal = (inputData, rules, meta, sectionKey) => {
    const result = {};

    for (const [key, config] of Object.entries(rules)) {
        const logCtx = `${sectionKey}[${key}]`;
        const res = applyRule(inputData, config, logCtx, inputData);

        if (res && res.isKilled) return res;

        result[key] = res;
    }

    return result;
};

/**
 * Helper: Extract global rules from section config
 */
const extractGlobalRules = (inputData, rules, meta) => {
    if (!meta.globalRules) return {};

    const globalRules = {};
    meta.globalRules.forEach(key => {
        if (rules[key] !== undefined) {
            globalRules[key] = applyRule(inputData, rules[key], key);
        }
    });

    return globalRules;
};

/**
 * Helper: Process secondary tables (e.g., specific_read_codes)
 */
const processSecondaryTables = (inputData, secRules, itemsMap, meta, pendingMappings) => {
    for (const [tableKey, tableConfig] of Object.entries(secRules)) {
        if (!tableConfig.value || !Array.isArray(tableConfig.value)) continue;

        const tableRows = tableConfig.value;

        for (const row of tableRows) {
            const itemId = row.child || row.child_code;
            if (!itemId) continue;

            let item = itemsMap.get(itemId);
            const isNew = !item;

            if (isNew) {
                logger.info(`[GenericEngine] Adding new item: ${itemId}`);
                item = {
                    [meta.itemKey]: itemId,
                    read_code_date: null,
                    comments: null,
                    code_type: null
                };
            }

            // Apply row properties
            Object.keys(row).forEach(key => {
                if (["child", "child_code", "addCode", "id"].includes(key)) return;

                if (key === "forcedMappings" && row[key] && row[key] !== itemId) {
                    pendingMappings.push({ from: itemId, to: row[key] });
                    return;
                }

                item[key] = row[key];
            });

            if (isNew) {
                itemsMap.set(itemId, item);
            }
        }
    }
};

/**
 * Helper: Apply rules to a single item
 */
const applyRulesToItem = (inputData, item, rules, meta, sectionKey) => {
    const itemId = item[meta.itemKey];
    const contextStr = `[${itemId}]`;

    for (const key of Object.keys(rules)) {
        if (key === "__secondaryRules" || meta.globalRules?.includes(key)) continue;

        const ruleConfig = rules[key];
        const isAdvancedRule = typeof ruleConfig === "object" && ruleConfig !== null && ruleConfig.type === "cascading-advanced";

        const logCtx = `${sectionKey}${contextStr}[${key}]`;

        // Create context chain: item -> inputData
        const context = new ContextChain([item, inputData]);
        const result = applyRule(inputData, ruleConfig, logCtx, item);

        if (result && result.isKilled) {
            logger.error(`[GenericEngine] KILL triggered at ${logCtx}`);
            return result;
        }

        // Advanced rules override, static rules fill missing
        if (isAdvancedRule) {
            item[key] = result;
        } else if (isEmpty(item[key])) {
            item[key] = result;
        }
    }

    return null;
};

/**
 * Helper: Apply forced mappings
 */
const applyForcedMappings = (itemsMap, mappings) => {
    mappings.forEach(mapping => {
        const item = itemsMap.get(mapping.from);
        if (item) {
            logger.info(`[GenericEngine] Forced mapping: ${mapping.from} -> ${mapping.to}`);
            item.child = mapping.to;
            itemsMap.delete(mapping.from);
            itemsMap.set(mapping.to, item);
        }
    });
};

/**
 * Helper: Refine item (apply field mappings and exclusions)
 * @deprecated Legacy method, use outputTemplate instead.
 */
const refineItem = (item, meta) => {
    const refined = { ...item };

    // Apply field mappings
    if (meta.fieldMappings) {
        for (const [sourceKey, mapping] of Object.entries(meta.fieldMappings)) {
            if (refined[sourceKey] !== undefined) {
                const transformFn = TransformFunctions[mapping.transform];
                refined[mapping.target] = transformFn ? transformFn(refined[sourceKey]) : refined[sourceKey];
            }
        }
    }

    // Remove excluded fields
    if (meta.excludeFields) {
        meta.excludeFields.forEach(key => delete refined[key]);
    }

    return refined;
};

