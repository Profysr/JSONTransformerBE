import logger from "../lib/logger.js";
import { applyRule } from "./ruleApplier.js";
import { processTableRules } from "./tableProcessor.js";
import { isEmpty } from "../lib/utils.js";

/** Helper: Evaluate global rules that apply to all codes */
const extractGlobalRules = (inputData, rules) => {
        const globalRuleKeys = ["use_inactive", "override_bilateral", "search_codes_in_problems"];
        const globalRules = {};

        globalRuleKeys.forEach(key => {
                if (rules[key] !== undefined) {
                        globalRules[key] = applyRule(inputData, rules[key], key);
                }
        });

        return globalRules;
};

/** Helper: Initialize codes map from existing letter_codes_list */
const initializeCodesMap = (existingList) => {
        const codesMap = new Map();

        existingList.forEach(item => {
                if (item.child) {
                        codesMap.set(item.child, { ...item });
                }
        });

        logger.info(`[ReadCodes] There are ${codesMap.size} existing codes present`);
        return codesMap;
};

/** Helper: Apply configuration rules to each code object */
const applyRulesToCode = (inputData, codeObj, rules, globalRuleKeys) => {
        const childCode = codeObj.child;
        const cTerm = codeObj.c_term || "";

        for (const key of Object.keys(rules)) {
                // Skip global rules and add_readcodes toggle
                if (key === "add_readcodes" || globalRuleKeys.includes(key)) continue;

                const ruleConfig = rules[key];
                const isAdvancedRule = typeof ruleConfig === "object" && ruleConfig !== null && ruleConfig.type === "cascading-advanced";

                // Evaluate rule with code object as local context
                // Include code identifier in fieldKey for better logging context
                const contextualFieldKey = `${key} [Code: ${childCode}${cTerm ? ` - ${cTerm}` : ""}]`;
                const result = applyRule(inputData, ruleConfig, contextualFieldKey, codeObj);

                // Handle KILL scenario
                if (result !== null && typeof result === "object" && result.isKilled === true) {
                        logger.error(`[${contextualFieldKey}] Rule triggered KILL`);
                        return {
                                isKilled: true,
                                field: key,
                                value: result.value,
                                inputData: inputData,
                        };
                }

                // Advanced rules override, static rules fill missing values
                if (isAdvancedRule) {
                        codeObj[key] = result;
                } else if (isEmpty(codeObj[key])) {
                        codeObj[key] = result;
                }
        }

        return null; // No kill
};

/** Helper: Clean and refine final code object for output */
const refineCodeObject = (codeObj) => {
        const refined = { ...codeObj };

        // Map add_date to boolean
        const addDateRaw = refined.add_date_readcodes !== undefined ? refined.add_date_readcodes : refined.add_date;
        refined.add_date = (addDateRaw === true || addDateRaw === "true");

        // Map severity from isMajor
        if (refined.isMajor !== undefined) {
                refined.problem_severity = (refined.isMajor == true || refined.isMajor == "true") ? "Major" : "Minor";
        }

        // Ensure read_code_date uses resolved date value
        if (refined.date_type_readcodes) {
                refined.read_code_date = refined.date_type_readcodes;
        }

        // Remove internal helper keys
        const keysToRemove = [
                "use_inactive", "override_bilateral", "search_codes_in_problems",
                "id", "qof", "qof_flags",
                "add_date_readcodes", "date_type_readcodes", "add_readcodes", "date_type",
                "isMajor"
        ];
        keysToRemove.forEach(k => delete refined[k]);

        return refined;
};

/** Helper: Apply forced mappings to codes */
const applyForcedMappings = (codesMap, pendingMappings) => {
        pendingMappings.forEach(mapping => {
                const codeObj = codesMap.get(mapping.from);
                if (codeObj) {
                        logger.info(`[ReadCodes] Applying forced mapping: ${mapping.from} -> ${mapping.to}`);
                        codeObj.child = mapping.to;
                        codesMap.delete(mapping.from);
                        codesMap.set(mapping.to, codeObj);
                }
        });
};

/** Main processor function */
export const processReadCodesRules = (inputData, rules, optionalCodesRules) => {
        logger.info(`[ReadCodes] Starting transformation...`);

        const globalRuleKeys = ["use_inactive", "override_bilateral", "search_codes_in_problems"];

        // Step 1: Evaluate add_readcodes toggle
        const addReadcodesResult = applyRule(inputData, rules.add_readcodes, "add_readcodes");

        if (addReadcodesResult !== null && typeof addReadcodesResult === "object" && addReadcodesResult.isKilled === true) {
                logger.error(`[ReadCodes] add_readcodes toggle triggered KILL`);
                return {
                        isKilled: true,
                        field: "add_readcodes",
                        value: addReadcodesResult.value,
                        inputData: inputData,
                };
        }

        const shouldIncludeExisting = !(addReadcodesResult === "false" || addReadcodesResult === false);
        logger.info(`[ReadCodes] add_readCode is true, So, keep the existing letter codes`);

        // Step 2: Initialize codes map
        const existingList = shouldIncludeExisting ? (inputData.letter_codes_list || []) : [];
        const codesMap = initializeCodesMap(existingList);
        const pendingForcedMappings = [];

        // Step 3: Process optional codes tables
        if (optionalCodesRules && typeof optionalCodesRules === "object") {
                for (const [tableKey, tableConfig] of Object.entries(optionalCodesRules)) {
                        logger.info(`[ReadCodes][Optional] Processing table: ${tableKey}`);

                        const tableResults = processTableRules(inputData, tableConfig, {
                                sectionKey: `ReadCodes:${tableKey}`,
                                skipField: "addCode",
                                onRowProcess: (row, inputData, { index }) => {
                                        const childCode = row.child || row.child_code;
                                        if (!childCode) return null;

                                        /** Looking if the child code is already present in our letter_code_list */
                                        let codeObj = codesMap.get(childCode);
                                        const isNew = !codeObj;

                                        if (isNew) {
                                                logger.info(`[ReadCodes][${tableKey}] Adding new code: ${childCode}`);
                                                codeObj = {
                                                        child: childCode,
                                                        read_code_date: null,
                                                        comments: null,
                                                        code_type: null
                                                };
                                        }

                                        // Apply row properties to code object
                                        Object.keys(row).forEach(key => {
                                                if (["child", "child_code", "addCode", "id"].includes(key)) return;

                                                // Handle forced mappings separately
                                                if (key === "forcedMappings") {
                                                        if (row[key] && row[key] !== childCode) {
                                                                pendingForcedMappings.push({ from: childCode, to: row[key] });
                                                        }
                                                        return;
                                                }

                                                codeObj[key] = row[key];
                                        });

                                        if (isNew) {
                                                codesMap.set(childCode, codeObj);
                                        }

                                        return null;
                                }
                        });

                        // Check for kill from table processing
                        if (tableResults && !Array.isArray(tableResults) && tableResults.isKilled) {
                                logger.error(`[ReadCodes][${tableKey}] Table processing triggered KILL`);
                                return tableResults;
                        }
                }
        }

        // Step 4: Apply configuration rules to each code
        logger.info(`[ReadCodes] Applying configuration rules to ${codesMap.size} codes...`);
        const entries = Array.from(codesMap.entries());

        for (const [childCode, codeObj] of entries) {
                const killResult = applyRulesToCode(inputData, codeObj, rules, globalRuleKeys);
                if (killResult) return killResult;
        }

        // Step 5: Apply forced mappings
        if (pendingForcedMappings.length > 0) {
                logger.info(`[ReadCodes] Applying ${pendingForcedMappings.length} forced mappings...`);
                applyForcedMappings(codesMap, pendingForcedMappings);
        }

        // Step 6: Refine and clean final output
        logger.info(`[ReadCodes] Refining final output...`);
        const finalCodes = Array.from(codesMap.values()).map(refineCodeObject);

        // Step 7: Extract global rules
        const globalRules = extractGlobalRules(inputData, rules);

        // Step 8: Construct final structured object
        inputData.readCodes = {
                global_rules: globalRules,
                letter_codes: finalCodes.map(c => c.child).join(", "),
                letter_codes_list: finalCodes
        };

        // Clean up old properties
        delete inputData.letter_codes_list;
        delete inputData.letter_codes;

        logger.info(`[ReadCodes] Completed. Total codes: ${finalCodes.length}`);
        return inputData;
};
