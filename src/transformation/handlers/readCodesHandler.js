import { resolveValue } from "../../lib/evaluateConditions.js";
import logger from "../../lib/logger.js";
import { isEmpty } from "../../utils/util.js";
import { applyTemplate } from "../Evaluators/TemplateEngine.js";
import { applyRule } from "../Evaluators/ApplyRule.js";
import { processTableRules } from "../Evaluators/tableProcessor.js";

// ============================================
// HELPER FUNCTIONS
// ============================================

// Initialize codes map from existing letter_codes_list
const initializeCodesMap = (existingList) => {
  const codesMap = new Map();

  existingList.forEach((item) => {
    if (item.child) {
      codesMap.set(item.child, { ...item });
    }
  });

  logger.info(`[ReadCodes] Initialized with ${codesMap.size} existing codes`);
  return codesMap;
};

// Build code object with explicit field mapping using Template Engine
const buildCodeObj = (codeContext, rules) => {
  // Standard ReadCodes Template
  const defaultTemplate = {
    /** General Fields */
    cTerm: { field: "c_term" },
    child: { field: "child" },
    codeType: { field: "code_type" },
    comments: { field: "comments" },

    /** Date Fields */
    addStartDate: {
      field: "add_date",
      transform: ["toBoolean", "toString"],
    },
    startDate: {
      field: "date_type",
      condition: { field: "add_date", operator: "contains", value: "true" },
    },
    addEndDate: {
      field: "add_endDate",
      transform: ["toBoolean", "toString"],
    },
    endDate: {
      field: "endDate_duration",
      transform: "addMonths",
      condition: { field: "add_endDate", operator: "contains", value: "true" },
    },

    // Conditional fields
    attachProblem: {
      field: "attach_problems",
      condition: {
        logic: "OR",
        rules: [
          { field: "code_type", operator: "contains", value: "diagnosis" },
          {
            field: "search_codes_in_problems",
            operator: "equals",
            value: true,
          },
        ],
      },
    },
    createProblem: {
      field: "create_problems",
      condition: {
        field: "code_type",
        operator: "contains",
        value: "diagnosis",
      },
    },

    promoteProblem: { field: "promote_problem" },
    putSummary: { field: "put_summary" },
    problemSeverity: {
      field: "problem_severity",
      transform: "mapSeverity",
      condition: {
        logic: "OR",
        rules: [
          { field: "create_problems", operator: "equals", value: true },
          { field: "promote_problem", operator: "is_not_empty" },
          { field: "put_summary", operator: "is_not_empty" },
        ],
      },
    },
  };

  const result = applyTemplate(defaultTemplate, codeContext);
  return result;
};

// Apply forced mappings to remap code identifiers
const applyForcedMappings = (codesMap, mappings) => {
  mappings.forEach((mapping) => {
    const codeObj = codesMap.get(mapping.from);
    if (codeObj) {
      logger.info(
        `[ReadCodes] Applying forced mapping: ${mapping.from} -> ${mapping.to}`,
      );
      codeObj.child = mapping.to;
      codesMap.delete(mapping.from);
      codesMap.set(mapping.to, codeObj);
    }
  });
};

// Extract global rules that apply to all codes
const extractGlobalRules = (inputData, rules) => {
  const globalRuleKeys = [
    "use_inactive",
    "override_bilateral",
    "search_codes_in_problems",
  ];
  const globalRules = {};

  globalRuleKeys.forEach((key) => {
    if (rules[key] !== undefined) {
      globalRules[key] = applyRule(inputData, rules[key], key);
    }
  });

  return globalRules;
};

// Apply configuration rules to each code object
const applyRulesToCode = (inputData, codeObj, rules, globalRuleKeys) => {
  const childCode = codeObj.child;

  for (const key of Object.keys(rules)) {
    // Skip global rules, add_readcodes toggle, and table configs
    if (key === "add_readcodes" || globalRuleKeys.includes(key)) continue;

    const ruleConfig = rules[key];

    // Skip table configurations
    if (
      ruleConfig &&
      typeof ruleConfig === "object" &&
      Array.isArray(ruleConfig.value)
    ) {
      continue;
    }

    const isAdvancedRule =
      typeof ruleConfig === "object" &&
      ruleConfig !== null &&
      ruleConfig.type === "cascading-advanced";

    // Evaluate rule with code object as local context
    const contextualFieldKey = `${key} [Code: ${childCode}]`;
    const result = applyRule(
      inputData,
      ruleConfig,
      contextualFieldKey,
      codeObj,
    );

    // Handle KILL scenario
    if (
      result !== null &&
      typeof result === "object" &&
      result.isKilled === true
    ) {
      logger.warn(`[${contextualFieldKey}] Rule triggered KILL`);
      return {
        ...result,
        isKilled: true,
        field: key,
        inputData: inputData,
      };
    }

    // Extract value if result is result object
    let finalValue = result;
    if (
      result &&
      typeof result === "object" &&
      result.hasOwnProperty("value") &&
      result.hasOwnProperty("isKilled")
    ) {
      finalValue = result.value;

      // Handle Matrix Assignments
      if (
        result.matrixAssignments &&
        typeof result.matrixAssignments === "object"
      ) {
        for (const [mKey, mVal] of Object.entries(result.matrixAssignments)) {
          const resolvedMVal = resolveValue(
            mVal,
            inputData,
            codeObj,
            `matrix:${childCode}`,
          );
          codeObj[mKey] = resolvedMVal;
          logger.info(
            `[${childCode}] Matrix assignment: ${mKey} = ${resolvedMVal}`,
          );
        }
      }

      // Handle Recipient Notes
      if (result.notes) {
        context.addNote(result.notes);
      }
    }

    // Advanced rules override, static rules fill missing values
    if (isAdvancedRule) {
      codeObj[key] = finalValue;
    } else if (isEmpty(codeObj[key])) {
      codeObj[key] = finalValue;
    }
  }

  return null; // No kill
};

// ============================================
// MAIN HANDLER
// ============================================

export const processReadCodes = (inputData, rules, context) => {
  logger.info(`[ReadCodes] Starting transformation...`);

  const globalRuleKeys = [
    "use_inactive",
    "override_bilateral",
    "search_codes_in_problems",
  ];

  // Step 1: Evaluate add_readcodes toggle (Check context first for overrides like matrix assignments)
  let useExistingReadCodes = context.getCandidate("add_readcodes");

  if (useExistingReadCodes === undefined) {
    useExistingReadCodes = applyRule(
      inputData,
      rules.add_readcodes,
      "add_readcodes",
    );
  } else {
    logger.info(
      `[ReadCodes] Using context override for add_readcodes: ${useExistingReadCodes}`,
    );
  }

  if (
    useExistingReadCodes !== null &&
    typeof useExistingReadCodes === "object" &&
    useExistingReadCodes.isKilled === true
  ) {
    logger.warn(`[ReadCodes] add_readcodes toggle triggered KILL`);
    context.setKilled({
      ...useExistingReadCodes,
      isKilled: true,
      field: "add_readcodes",
    });
    return;
  }

  const shouldIncludeExisting = !(
    useExistingReadCodes == "false" || useExistingReadCodes == false
  );

  if (shouldIncludeExisting) {
    logger.info(
      `[ReadCodes] add_readcodes is true, keeping existing codes, present in letter codes list`,
    );
  } else {
    logger.info(
      `[ReadCodes] add_readcodes is false, skipping existing codes from input.`,
    );
  }

  // Step 2: Initialize codes map from letter_codes_list (Empty if toggle was false)
  const existingList = shouldIncludeExisting
    ? inputData.output?.letter_codes_list || inputData.letter_codes_list || []
    : [];
  const codesMap = initializeCodesMap(existingList);
  const pendingForcedMappings = [];

  // Step 3: Process specific_codes table
  // REQUIREMENT 3: Merge/Override codes defined in the 'specific_codes' table.
  if (rules.specific_codes) {
    logger.info(`[ReadCodes] Processing specific_codes table...`);

    const tableResults = processTableRules(inputData, rules.specific_codes, {
      sectionKey: "ReadCodes:specific_codes",
      skipField: "addCode",
      identifierKey: "child",
      context, // Pass context
      onRowSkip: (row) => {
        // if the code is present already, we remove it
        const childCode = row.child;
        if (childCode && codesMap.has(childCode)) {
          logger.info(
            `[ReadCodes][specific_codes] Explicit skip for ${childCode}. Removing from list.`,
          );
          codesMap.delete(childCode);
        }
      },
      onRowProcess: (row, inputData, { index }) => {
        const childCode = row.child;
        if (!childCode) return null;

        // Check if code already exists in map (to override) or is new (to merge)
        let codeObj = codesMap.get(childCode);
        const isNew = !codeObj;

        if (isNew) {
          logger.info(
            `[ReadCodes][specific_codes] Adding new code: ${childCode}`,
          );
          codeObj = {
            child: childCode,
            read_code_date: null,
            comments: null,
            code_type: null,
          };
        }

        // Apply table row properties to code object (Overriding existing if present)
        Object.keys(row).forEach((key) => {
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
      },
    });

    // Check for KILL from table processing
    if (tableResults && !Array.isArray(tableResults) && tableResults.isKilled) {
      logger.warn(
        `[ReadCodes][specific_codes] Table processing triggered KILL`,
      );
      context.setKilled(tableResults);
      return;
    }
  }

  // REQUIREMENT 2: Apply general rules that apply to all codes (existing or from table).
  logger.info(
    `[ReadCodes] Applying configuration rules to ${codesMap.size} codes...`,
  );
  const entries = Array.from(codesMap.entries());

  for (const [childCode, codeObj] of entries) {
    const result = applyRulesToCode(inputData, codeObj, rules, globalRuleKeys);

    if (result && result.isKilled) {
      context.setKilled(result);
      return;
    }
  }

  // Step 5: Apply forced mappings
  if (pendingForcedMappings.length > 0) {
    logger.info(
      `[ReadCodes] Applying ${pendingForcedMappings.length} forced mappings...`,
    );
    applyForcedMappings(codesMap, pendingForcedMappings);
  }

  // Step 6: Extract global rules and build final output
  const globalRules = extractGlobalRules(inputData, rules);
  logger.info(`[ReadCodes] Building final output...`);
  const finalCodes = Array.from(codesMap.values()).map((code) =>
    buildCodeObj({ ...code, ...globalRules }, rules),
  );

  // Add global rules onto the root level of inputData
  globalRuleKeys.forEach((key) => {
    if (!isEmpty(globalRules[key])) {
      context.addCandidate(key, globalRules[key], "section:readCodes (global)");
    }
  });

  // Step 8: Update inputData with transformed codes
  // Add to context candidates (Always add even if empty)
  context.addCandidate(
    "transformed_letter_codes_list",
    finalCodes || [],
    "section:readCodes",
  );
  context.addCandidate(
    "transformed_letter_codes",
    (finalCodes || []).map((c) => c.child).join(", ") || "",
    "section:readCodes",
  );
  context.addCandidate(
    "add_readcodes",
    shouldIncludeExisting ? "true" : "false",
    "section:readCodes",
  );

  logger.info(`[ReadCodes] Completed. Total codes: ${finalCodes.length}`);
};
