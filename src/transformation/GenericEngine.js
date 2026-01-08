import logger from "../lib/logger.js";
import { SectionRegistry } from "./config/SectionRegistry.js";
import { RowProcessors } from "./config/RowProcessors.js";
import { applyRule } from "./ruleApplier.js";
import { processTableRules } from "./tableProcessor.js";
import { isEmpty } from "../utils/utils.js";
import { applyTemplate } from "./TemplateEngine.js";

/**
 * Main entry point for generic transformation ✅
 */
export const processGeneric = (inputData, configRules) => {
    const output = {};

    // 1. Identify all internal/nested tables to avoid processing them as root sections
    const internalTables = new Set();
    Object.values(SectionRegistry).forEach(meta => {
        if (meta.tables) meta.tables.forEach(t => internalTables.add(t));
    });

    for (const [sectionKey, rules] of Object.entries(configRules)) {
        // Skip if this key is actually an internal table of another section
        if (internalTables.has(sectionKey)) continue;

        let meta = SectionRegistry[sectionKey];
        if (!meta) {
            meta = { processingScope: "global", outputPath: null };
        }

        logger.info(`[GenericEngine] Processing section '${sectionKey}' with '${meta.processingScope}' scope`);

        let result;
        switch (meta.processingScope) {
            case "collection":
                result = processCollection(inputData, rules, meta, sectionKey);
                break;
            case "global":
                result = processGlobal(inputData, rules, meta, sectionKey);
                break;
            default:
                const msg = `[GenericEngine] Unknown processing scope: ${meta.processingScope}. Please check section Registry`;
                logger.error(msg);
                throw new Error(msg);
        }

        if (result) {
            if (result.results) {
                // COLLECTION handling
                if (result.results.isKilled) {
                    logger.error(`[GenericEngine] Section '${sectionKey}' triggered KILL`);
                    return {
                        field: result.results.fieldKey,
                        value: result.results.value,
                        isKilled: true,
                        sectionKey
                    };
                }

                const actualResult = result.results;
                let finalValue = actualResult;

                if (meta.outputTemplate) {
                    logger.info(`[GenericEngine][${sectionKey}] Applying output template...`);
                    finalValue = actualResult.map(item => {
                        const context = { ...item, inputData };
                        return applyTemplate(meta.outputTemplate, context);
                    });
                }

                if (meta.outputPath === null) {
                    Object.assign(output, finalValue);
                } else {
                    output[meta.outputPath] = finalValue;
                }

                if (result.hideKeys) {
                    result.hideKeys.forEach(k => {
                        logger.info(`[GenericEngine][${sectionKey}] Hiding internal table root key: ${k}`);
                        output[k] = null;
                    });
                }
            } else {
                // GLOBAL handling
                if (result.isKilled) {
                    logger.error(`[GenericEngine] Global Section '${sectionKey}' triggered KILL`);
                    return {
                        field: result.fieldKey,
                        value: result.value,
                        isKilled: true,
                        sectionKey
                    };
                }

                if (meta.outputPath === null) {
                    Object.assign(output, result);
                } else {
                    output[meta.outputPath] = result;
                }
            }
        }
    }

    return output;
};

/**
 * Process a COLLECTION section (Unified for Input Arrays and Config Tables) ✅
 */
const processCollection = (inputData, rules, meta, sectionKey) => {
    const itemsMap = new Map();
    const pendingForcedMappings = {}; // Track ID shifts for final application
    const inputPathVal = inputData[meta.inputPath];

    // 1. Global Skip Field Check: If globalSkipField is false, return empty array immediately
    if (meta.globalSkipField && rules[meta.globalSkipField] !== undefined) {
        const globalSkip = applyRule(inputData, rules[meta.globalSkipField], meta.globalSkipField);
        if (globalSkip === false || globalSkip === "false") {
            logger.info(`[processCollection][${sectionKey}] Global '${meta.globalSkipField}' is false. Returning empty array.`);
            return { results: [] };
        }
    }

    // 2. Conditional Seeding: Seed from input only if seedFromInput is not explicitly false
    const shouldSeed = meta.seedFromInput !== false;

    if (shouldSeed && Array.isArray(inputPathVal)) {
        logger.info(`[processCollection][${sectionKey}] Seeding from input array '${meta.inputPath}' (${inputPathVal.length} items)`);
        inputPathVal.forEach(item => {
            if (item[meta.itemKey]) {
                itemsMap.set(item[meta.itemKey], { ...item });
            }
        });
    } else if (shouldSeed) {
        logger.info(`[processCollection][${sectionKey}] Input '${meta.inputPath}' is not an array. Skipping seed.`);
    } else {
        logger.info(`[processCollection][${sectionKey}] seedFromInput is false. Starting with empty collection.`);
    }

    const generalRules = extractGeneralRules(inputData, rules, meta.generalRules);

    // 2. Table Processing: Process all tables defined in registry
    // Look for tables in both 'rules' (config) and 'inputData' (the source JSON)
    const tablesToProcess = [];
    if (meta.tables) {
        meta.tables.forEach(name => {
            if (rules[name]) {
                tablesToProcess.push({ name, config: rules[name] });
            } else if (inputData[name]) {
                // Also support tables present directly in the input data
                tablesToProcess.push({ name, config: inputData[name], isFromData: true });
            }
        });
    }

    const tablesToHide = new Set();

    for (const table of tablesToProcess) {
        logger.info(`[processCollection][${sectionKey}] Initializing table: ${table.name}`);
        if (table.isFromData) tablesToHide.add(table.name);

        const killResult = processTableRules(inputData, table.config, {
            sectionKey: table.name,
            skipField: null,
            onRowProcess: (row, inputData) => {
                const itemId = row[meta.itemKey] || row.child;

                logger.info(`[processCollection][${sectionKey}][Table:${table.name}] Processing row for item: ${itemId}`);

                const rowContext = Array.isArray(inputPathVal)
                    ? itemsMap.get(itemId)
                    : inputPathVal;

                if (rowContext) {
                    logger.info(`[processCollection][${sectionKey}] Found existing context for item: ${itemId}`);
                }

                const processor = RowProcessors[meta.rowProcessor];
                const processed = processor ? processor(row, rowContext, meta) : row;

                if (!processed) {
                    logger.info(`[processCollection][${sectionKey}] Processor returned null for item: ${itemId}`);
                    return null;
                }

                /** removing if skipField = true */
                if (processed._remove) {
                    const removeId = processed.identifier || itemId;
                    logger.info(`[processCollection][${sectionKey}] Removal signal for: ${removeId}`);

                    if (removeId) {
                        let deleted = false;
                        for (const [id, item] of itemsMap.entries()) {
                            if (item[meta.itemKey] === removeId || id === removeId) {
                                itemsMap.delete(id);
                                deleted = true;
                                logger.info(`[processCollection][${sectionKey}] Successfully removed ${removeId}`);
                                break;
                            }
                        }
                        if (!deleted) logger.warn(`[processCollection][${sectionKey}] Could not find item to remove: ${removeId}`);
                    }
                    return null;
                }

                const itemsToAdd = Array.isArray(processed) ? processed : [processed];

                itemsToAdd.forEach(itemData => {
                    const finalId = itemData[meta.itemKey] || itemData.child;
                    if (!finalId) {
                        logger.error(`[processCollection][${sectionKey}] Row processed but missing itemKey:`, itemData);
                        return;
                    }

                    let targetItem = itemsMap.get(finalId);
                    if (!targetItem) {
                        for (const [id, item] of itemsMap.entries()) {
                            if (item[meta.itemKey] === finalId) {
                                targetItem = item;
                                break;
                            }
                        }

                        if (!targetItem) {
                            logger.info(`[processCollection][${sectionKey}] Adding new item to map: ${finalId}`);
                            targetItem = { [meta.itemKey]: finalId };
                            itemsMap.set(finalId, targetItem);
                        }
                    }

                    logger.info(`[processCollection][${sectionKey}] Merging table data into item: ${finalId}`);
                    const rowMappings = mergeDataAndExtractMappings(targetItem, itemData, meta.itemKey);
                    if (rowMappings) {
                        logger.info(`[processCollection][${sectionKey}] Collected forcing mapping for ${finalId}`);
                        Object.assign(pendingForcedMappings, rowMappings);
                    }
                });

                return null;
            }
        });

        if (killResult && killResult.isKilled) return killResult;
    }

    // 3. Apply general properties (rules) to each item in itemsMap
    // Local context will be each object in the letter_codes_list
    for (const item of itemsMap.values()) {
        const killResult = applyGeneralRulesToItem(inputData, item, rules, meta, sectionKey);
        if (killResult) return killResult;
    }

    // 4. Apply Forced Mappings at the end
    if (Object.keys(pendingForcedMappings).length > 0) {
        applyForcedMappings(itemsMap, pendingForcedMappings, meta.itemKey);
    }

    const finalResult = {
        results: Array.from(itemsMap.values())
    };

    if (tablesToHide.size > 0) {
        finalResult.hideKeys = Array.from(tablesToHide);
    }

    return finalResult;
};

/**
 * Helper: Merge processed row data into an item, and extract forced mappings if any
 */
const mergeDataAndExtractMappings = (item, data, itemKey) => {
    const currentId = item[itemKey];
    let mappings = null;

    Object.entries(data).forEach(([key, val]) => {
        // Skip system/ID keys
        if (["id", "child", "child_code", "addCode", itemKey].includes(key)) return;

        // Collect Forced Mappings
        if (key === "forcedMappings" && val && val !== currentId) {
            if (!mappings) mappings = {};
            mappings[currentId] = val;
            return;
        }

        item[key] = val;
    });

    return mappings;
};

/**
 * Apply forced mappings to remap identifiers in the itemsMap
 */
const applyForcedMappings = (itemsMap, mappings, itemKey) => {
    Object.entries(mappings).forEach(([oldId, newId]) => {
        if (itemsMap.has(oldId)) {
            const item = itemsMap.get(oldId);
            logger.info(`[GenericEngine] Applying Forced Mapping: ${oldId} -> ${newId}`);
            item[itemKey] = newId;
            itemsMap.delete(oldId);
            itemsMap.set(newId, item);
        }
    });
};

/**
 * Apply general rules directly to root output ✅
 */
const processGlobal = (inputData, rules, meta, sectionKey) => {
    const result = {};
    for (const [key, config] of Object.entries(rules)) {
        const res = applyRule(inputData, config, key);
        if (res && res.isKilled) return res;
        result[key] = res;
    }
    return result;
};

/**
 * Helper: Extract and evaluate general rules for a section ✅
 */
const extractGeneralRules = (inputData, rules, metaGeneralRules) => {
    if (!metaGeneralRules) return {};
    const generalRules = {};
    metaGeneralRules.forEach(key => {
        if (rules[key] !== undefined) {
            generalRules[key] = applyRule(inputData, rules[key], key);
        }
    });
    return generalRules;
};

/**
 * Apply rules to a single item in a collection ✅
 */
const applyGeneralRulesToItem = (inputData, item, rules, meta, sectionKey = "") => {
    const itemId = item[meta.itemKey];

    for (const key of Object.keys(rules)) {
        // Skip globalSkipField, generalRules, and tables
        if (key === meta.globalSkipField) continue;
        if (meta.generalRules?.includes(key)) continue;

        const ruleConfig = rules[key];
        // Skip table configurations
        if (ruleConfig && typeof ruleConfig === "object" && Array.isArray(ruleConfig.value) && Array.isArray(ruleConfig.columns)) {
            continue;
        }

        const res = applyRule(inputData, ruleConfig, `[${itemId}][${key}]`, item);
        if (res && res.isKilled) return res;

        const isAdvanced = typeof ruleConfig === "object" && ruleConfig?.type === "cascading-advanced";
        if (isAdvanced || isEmpty(item[key])) {
            item[key] = res;
        }
    }
    return null;
};
