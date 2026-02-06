import logger from "../../../shared/logger.js";
import { applyTemplate } from "../engineFunctions/TemplateEngine.js";
import { applyRule } from "../evaluators/ApplyRule.js";
import { processTableRules } from "../evaluators/tableProcessor.js";

// ==================
// 1 Laterality Mapping Logic
// ==================
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

// ==================
// 2 Forced Mapping Logic
// ==================

const applyForcedMappings = (codesMap, mappings) => {
  mappings.forEach((mapping) => {
    const codeObj = codesMap.get(mapping.from);
    if (codeObj) {
      logger.info(
        `[ReadCodes] Applying forced mapping for code: ${mapping.from} -> ${mapping.to}`,
      );
      codeObj.child = mapping.to;
      codesMap.delete(mapping.from);
      codesMap.set(mapping.to, codeObj);
    }
  });
};

// ==================
// 3 Base Object Builder
// ==================

const buildBaseObj = (data, rules, context) => {
  const template = {
    child: { field: "child" },
    comments: { field: "comments" },
    addStartDate: { field: "add_date" },
    startDate: {
      field: "date_type",
      condition: { field: "add_date", operator: "contains", value: "true" }
    },
    promoteProblem: { field: "promote_problem" },
    putSummary: { field: "put_summary" },
    problemSeverity: {
      field: "problem_severity",
      transform: "mapSeverity",
    },
  };

  return applyTemplate(template, data, context);
};

// ==================
// 4 Updates the codesMap based on the specific_codes table
// ==================

const updateCodesMapFromSpecificCodes = (inputData, specificCodesRules, codesMap, pendingForcedMappings, context) => {
  if (!specificCodesRules) return;

  processTableRules(inputData, specificCodesRules, {
    sectionKey: "ReadCodes:specific_codes",
    context,
    onRowProcess: (processedRow) => {
      const childCode = processedRow.child;
      if (!childCode) return null;

      let codeObj = codesMap.get(childCode) || { child: childCode };

      Object.keys(processedRow).forEach(key => {
        if (["id", "forced_mappings", "addCode"].includes(key)) return;
        codeObj[key] = processedRow[key];
      });

      if (processedRow.forced_mappings && processedRow.forced_mappings !== childCode && processedRow.forced_mappings !== "skip") {
        pendingForcedMappings.push({ from: childCode, to: processedRow.forced_mappings });
      }

      codesMap.set(childCode, codeObj);
      return null;
    }
  });

  if (pendingForcedMappings.length > 0) {
    applyForcedMappings(codesMap, pendingForcedMappings);
  }
};

// ==================
// 5 Code Entry Execution
// ==================
/**
 * Processes an individual code entry and determines its destination
 */
const processCodeEntry = (codeData, childCode, rules, context, options) => {
  const { shouldIncludeExisting, lateralityMap, problemsCsv, results } = options;

  if (codeData.comments) {
    codeData.comments = applyLateralityMapping(codeData.comments, lateralityMap);
  }

  const tableRow = rules.specific_codes?.value?.find(r => r.child === childCode) || {};

  const isWay1 = tableRow.addCode === true || (shouldIncludeExisting && tableRow.addCode !== false);
  const isWay2 = tableRow.promote_problem || tableRow.put_summary || tableRow.problem_severity;

  if (isWay1 || isWay2) {
    const codeObj = buildBaseObj(codeData, rules, context);
    results.readCodes.push(codeObj);
  }

  if (tableRow.attach_problem) {
    results.download_problems_csv = true;

    if (problemsCsv.length > 0) {
      const matchingIndex = problemsCsv.findIndex(p =>
        p.code === childCode || p.readCode === childCode || p.child === childCode
      );

      if (matchingIndex !== -1) {
        results.attachProblems.push(matchingIndex);
      } else if (tableRow.create_problem) {
        results.createProblems.push(buildBaseObj(codeData, rules, context));
      }
    } else {
      logger.warn(`[ReadCodes][${childCode}] Code requires matching but 'problems_csv' is missing from patient data.`);
    }
  } else if (tableRow.create_problem) {
    results.createProblems.push(buildBaseObj(codeData, rules, context));
  }
};

// ==================
// 6 Main Handler
// ==================
export const processReadCodes = (inputData, rules, context) => {
  logger.info(`[ReadCodes] Starting analysis of letter codes.`);

  const results = {
    readCodes: [],
    createProblems: [],
    attachProblems: [],
    download_problems_csv: false
  };
  const pendingForcedMappings = [];
  const lateralityMap = getLateralityMappings(rules);

  const existingCodes = inputData.letter_codes_list || [];
  const codesMap = new Map();
  existingCodes.forEach(c => {
    if (c.child) codesMap.set(c.child, { ...c });
  });

  const useExisting = context.getCandidate("add_readcodes") ?? applyRule(inputData, rules.add_readcodes, "add_readcodes", {}, context);
  const shouldIncludeExisting = !(useExisting == "false" || useExisting == false);

  if (!shouldIncludeExisting) {
    logger.info(`[ReadCodes] Focusing only on 'specific_codes' table (existing codes ignored).`);
    codesMap.clear();
  }

  updateCodesMapFromSpecificCodes(inputData, rules.specific_codes, codesMap, pendingForcedMappings, context);

  const problemsCsv = inputData.problems_csv || [];
  codesMap.forEach((codeData, childCode) => {
    processCodeEntry(codeData, childCode, rules, context, {
      shouldIncludeExisting,
      lateralityMap,
      problemsCsv,
      results
    });
  });

  context.addCandidate("readCodes", results.readCodes, "section:readCodes");
  context.addCandidate("createProblems", results.createProblems, "section:readCodes");
  context.addCandidate("attachProblems", results.attachProblems, "section:readCodes");
  context.addCandidate("download_problems_csv", results.download_problems_csv, "section:readCodes");

  logger.info(`[ReadCodes] Analysis completed. Results: ${results.readCodes.length} codes, ${results.createProblems.length} new problems, ${results.attachProblems.length} attached problems.`);
};
