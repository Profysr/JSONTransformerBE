import logger from "../../../shared/logger.js";
import { isEmpty } from "../../../shared/utils/generalUtils.js";
import { applyRule } from "../../evaluators/ApplyRule.js";
import { processTableRules } from "../../evaluators/tableProcessor.js";

import {
  getLateralityMappings,
  applyLateralityMapping,
  applyForcedMappings,
} from "./mappings.js";

import { classifyReadCodes } from "./classifiers.js";
import { processProblemAttachments } from "./attachmentResolver.js";

// ==================
// 0. Helpers
// ==================

const isFalse = (v) => v === false || v === "false";

// ==================
// 1. Specific Codes Table Processing
// ==================
const updateCodesMapFromSpecificCodes = (
  inputData,
  specificCodesRules,
  codesMap,
  pendingForcedMappings,
  context,
  sectionKey = "",
) => {
  if (!specificCodesRules) return;

  processTableRules(inputData, specificCodesRules, {
    sectionKey: "Specific Codes",
    context,

    onRowProcess: (row) => {
      if (!row.child) return;

      const codeObj = codesMap.get(row.child) || { child: row.child };
      Object.entries(row).forEach(([k, v]) => {
        if (!["id", "forced_mappings"].includes(k)) codeObj[k] = v;
      });

      codeObj.add_code = true;
      
      if (
        row.forced_mappings &&
        row.forced_mappings !== row.child &&
        row.forced_mappings !== "skip"
      ) {
        pendingForcedMappings.push({ from: row.child, to: row.forced_mappings });
      }

      codesMap.set(row.child, codeObj);
    },

    onRowSkip: (row) => {
      if (!row.child) return;
      const codeObj = codesMap.get(row.child) || { child: row.child };
      codeObj.add_code = false;
      codesMap.set(row.child, codeObj);
    },
  });
};

// ==================
// 2. Main Handler
// ==================
export const processReadCodes = (inputData, rules, context, sectionKey) => {
  const functionName = "processReadCodes";
  const logMeta = { sectionKey, functionName };

  logger.info(`Input letter codes count: ${inputData.letter_codes_list?.length || 0}`, logMeta);

  const results = {
    readCodes: [],
    createProblems: [],
    attachProblems: [],
    download_problems_csv: false,
  };

  // 1. Setting incoming codes
  const codesMap = new Map();
  const useExisting =
    context.getCandidate("add_readcodes") ??
    applyRule(inputData, rules.add_readcodes, "add_readcodes", {}, context, sectionKey);

  if (!isFalse(useExisting)) {
    (inputData.letter_codes_list || []).forEach((c) => {
      if (c.child) codesMap.set(c.child, { ...c });
    });
  }

  // 2. Processing specific codes table
  const pendingForcedMappings = [];
  updateCodesMapFromSpecificCodes(
    inputData,
    rules.specific_codes,
    codesMap,
    pendingForcedMappings,
    context,
    sectionKey,
  );

  const lateralityMap = getLateralityMappings(rules);
  if (lateralityMap.size > 0) {
    codesMap.forEach((c) => {
      if (!isEmpty(c.comments)) {
        c.comments = applyLateralityMapping(c.comments, lateralityMap);
      }
    });
  }

  if (pendingForcedMappings.length > 0) {
    applyForcedMappings(codesMap, pendingForcedMappings, sectionKey);
  }

  // 3. Classifying read codes
  const pendingProblemAttachments = [];
  classifyReadCodes(codesMap, rules, results, pendingProblemAttachments, context, sectionKey);

  // 4. Processing problem attachments
  const problemsCsv = inputData.problems_csv || [];
  processProblemAttachments(
    results,
    pendingProblemAttachments,
    problemsCsv,
    rules,
    context,
    sectionKey,
  );

  context.addCandidate("readCodes", results.readCodes, sectionKey);
  context.addCandidate("createProblems", results.createProblems, sectionKey);
  context.addCandidate("attachProblems", results.attachProblems, sectionKey);
  context.addCandidate(
    "download_problems_csv",
    results.download_problems_csv,
    sectionKey
  );

  logger.info(
    `Done → ${results.readCodes.length} read codes, ` +
    `${results.createProblems.length} problems created, ` +
    `${results.attachProblems.length} attached.`,
    logMeta
  );
};
