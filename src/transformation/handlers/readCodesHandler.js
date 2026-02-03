import logger from "../../lib/logger.js";
import { applyTemplate } from "../Evaluators/TemplateEngine.js";
import { applyRule } from "../Evaluators/ApplyRule.js";
import { processTableRules } from "../Evaluators/tableProcessor.js";

// ============================================
// HELPER FUNCTIONS
// ============================================

const getLateralityMappings = (rules) => {
  const mappingMap = new Map();
  const table = rules.laterality_mappings;

  if (table && Array.isArray(table.value)) {
    table.value.forEach((row) => {
      const side = row.side;
      const mappingsStr = row.mappings || "";
      if (side && mappingsStr) {
        mappingsStr.split(",").forEach((m) => {
          const trimmed = m.trim().toLowerCase();
          if (trimmed) mappingMap.set(trimmed, side);
        });
      }
    });
  }

  return mappingMap;
};

const applyLateralityMapping = (comment, mappingMap) => {
  if (!comment || typeof comment !== "string" || mappingMap.size === 0) return comment;

  const words = comment.split(/(\b|\s+|[,.;:!])/);
  const transformed = words.map((word) => {
    const key = word.trim().toLowerCase();
    if (mappingMap.has(key)) {
      return mappingMap.get(key);
    }
    return word;
  });

  return transformed.join("");
};

/**
 * Apply forced mappings to remap code identifiers
 */
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

/**
 * Build the base code/problem object using the template engine
 */
const buildBaseObj = (data, rules, context) => {
  // Define the strict template as requested
  const template = {
    // Core Identity
    child: { field: "child" },
    comments: { field: "comments" },

    // Date Logic
    addStartDate: { field: "add_date" }, // Keep as-is (unified object or value)
    startDate: {
      field: "date_type",
      condition: { field: "add_date", operator: "contains", value: "true" }
    },

    // Problem Flags (Unified Fields)
    promoteProblem: { field: "promote_problem" },
    putSummary: { field: "put_summary" },
    problemSeverity: {
      field: "problem_severity",
      transform: "mapSeverity",
    },
  };

  // Note: TemplateEngine automatically handles nested structure if the source data 
  // contains the dependent values within a unified object structure.

  return applyTemplate(template, data, context);
};

// ============================================
// MAIN HANDLER
// ============================================

export const processReadCodes = (inputData, rules, context) => {
  logger.info(`[ReadCodes] Starting transformation...`);

  // 1. Initialize lists and flags
  const readCodes = [];
  const createProblems = [];
  const attachProblems = [];
  const pendingForcedMappings = [];
  let download_problems_csv = false;

  // 2. Setup Laterality
  const lateralityMap = getLateralityMappings(rules);

  // 3. Prepare Existing Codes Map (for overrides from specific_codes)
  const existingCodes = inputData.letter_codes_list || [];
  const codesMap = new Map();
  existingCodes.forEach(c => {
    if (c.child) codesMap.set(c.child, { ...c });
  });

  // 4. Determine which codes to process
  // If add_readcodes is false, we only process what's in specific_codes table
  const useExisting = context.getCandidate("add_readcodes") ?? applyRule(inputData, rules.add_readcodes, "add_readcodes", {}, context);
  const shouldIncludeExisting = !(useExisting == "false" || useExisting == false);

  if (!shouldIncludeExisting) {
    logger.info(`[ReadCodes] Skipping existing codes, only using specific_codes table.`);
    codesMap.clear();
  }

  // 5. Process specific_codes table to populate/override codesMap
  if (rules.specific_codes) {
    processTableRules(inputData, rules.specific_codes, {
      sectionKey: "ReadCodes:specific_codes",
      context,
      onRowProcess: (processedRow) => {
        const childCode = processedRow.child;
        if (!childCode) return null;

        let codeObj = codesMap.get(childCode) || { child: childCode };

        // Merge table properties (excluding internal keys)
        Object.keys(processedRow).forEach(key => {
          if (["id", "forced_mappings", "addCode"].includes(key)) return;
          codeObj[key] = processedRow[key];
        });

        // Handle forced mappings separately
        if (processedRow.forced_mappings && processedRow.forced_mappings !== childCode && processedRow.forced_mappings !== "skip") {
          pendingForcedMappings.push({ from: childCode, to: processedRow.forced_mappings });
        }

        codesMap.set(childCode, codeObj);
        return null;
      }
    });

    // Apply forced mappings before logic processing
    if (pendingForcedMappings.length > 0) {
      applyForcedMappings(codesMap, pendingForcedMappings);
    }
  }

  // 6. Iterate and apply logic for each code
  const problemsCsv = inputData.problems_csv || [];

  codesMap.forEach((codeData, childCode) => {
    // A. Apply laterality mapping to comments
    if (codeData.comments) {
      codeData.comments = applyLateralityMapping(codeData.comments, lateralityMap);
    }

    // B. Evaluate rules for this specific code
    const tableRow = rules.specific_codes?.value?.find(r => r.child === childCode) || {};

    // Way 1 & 2: Add Read Codes
    // Logic: If addCode is true OR it has special behavioral fields (promote, putSummary, severity)
    const isWay1 = tableRow.addCode === true || (shouldIncludeExisting && tableRow.addCode !== false);
    const isWay2 = tableRow.promote_problem || tableRow.put_summary || tableRow.problem_severity;

    if (isWay1 || isWay2) {
      const codeObj = buildBaseObj(codeData, rules, context);
      readCodes.push(codeObj);
    }

    // Way 3 & 4: Problem Links
    // 3: Match and attach (attach_problem: true)
    // 4: Just attach/create (create_problem: true)
    if (tableRow.attach_problem) {
      download_problems_csv = true;

      if (problemsCsv.length > 0) {
        // Try to match
        const matchingIndex = problemsCsv.findIndex(p =>
          p.code === childCode || p.readCode === childCode || p.child === childCode
        );

        if (matchingIndex !== -1) {
          attachProblems.push(matchingIndex);
        } else if (tableRow.create_problem) {
          // If match fails and create_problem is true, we create it
          createProblems.push(buildBaseObj(codeData, rules, context));
        }
      } else {
        // Defer matching - the automation flag will handle the re-request
        logger.info(`[ReadCodes] Code ${childCode} requires matching but problems_csv is missing.`);
      }
    } else if (tableRow.create_problem) {
      // Way 4 (part 2): Just create without looking for existing
      createProblems.push(buildBaseObj(codeData, rules, context));
    }
  });

  // 7. Store results in context
  context.addCandidate("readCodes", readCodes, "section:readCodes");
  context.addCandidate("createProblems", createProblems, "section:readCodes");
  context.addCandidate("attachProblems", attachProblems, "section:readCodes");
  context.addCandidate("download_problems_csv", download_problems_csv, "section:readCodes");

  logger.info(`[ReadCodes] Completed. readCodes: ${readCodes.length}, createProblems: ${createProblems.length}, attachProblems: ${attachProblems.length}, download_problems_csv: ${download_problems_csv}`);
};
