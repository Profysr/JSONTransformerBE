import logger from "../../../shared/logger.js";
import { isEmpty } from "../../../shared/utils/generalUtils.js";
import { applyRule } from "../../evaluators/ApplyRule.js";
import { processTableRules } from "../../evaluators/tableProcessor.js";

import {
  getLateralityMappings,
  applyLateralityMapping,
  applyForcedMappings,
} from "./mappings.js";

import { processProblemAttachments } from "./processProblems.js";
import { getFeatures } from "./features.js";
import { classifyReadCodes } from "./codesClassification.js";

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
  // sectionKey = "",
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
// 2. Pending Codes (Optimization)
// ==================
const handlePendingCodes = (inputData, rules, context, sectionKey, results) => {
  const logMeta = { sectionKey, functionName: "handlePendingCodes" };
  const pendingCodes = inputData.pendingCodes || [];

  logger.info(`Optimized path: Processing ${pendingCodes.length} pending codes.`, logMeta);

  // Directly pass to attachments (bypass classification)
  const problemsCsv = inputData.problems_csv || [];
  processProblemAttachments(
    results,
    pendingCodes, // Here pendingCodes acts as pendingProblemAttachments
    problemsCsv,
    rules,
    context,
    sectionKey,
    getFeatures(inputData, rules, context, sectionKey)
  );
};

// ==================
// 3. Main Handler
// ==================
export const processReadCodes = (inputData, rules, context, sectionKey) => {
  const functionName = "processReadCodes";
  const logMeta = { sectionKey, functionName };

  // Initialize Features
  const features = getFeatures(inputData, rules, context, sectionKey);
  logger.info(`Features enabled: ${JSON.stringify(features)}`, logMeta);

  const results = {
    readCodes: [],
    createProblems: [],
    attachProblems: [],
    pendingCodes: [],
    download_problems_csv: false,
  };

  // Optimization: Second Endpoint Path
  if (inputData.is_pending_resolution && inputData.pendingCodes?.length > 0) {
    handlePendingCodes(inputData, rules, context, sectionKey, results);

    // Export results and exit
    context.addCandidate("readCodes", results.readCodes, sectionKey);
    context.addCandidate("createProblems", results.createProblems, sectionKey);
    context.addCandidate("attachProblems", results.attachProblems, sectionKey);
    context.addCandidate("pendingCodes", results.pendingCodes, sectionKey);
    context.addCandidate("download_problems_csv", results.download_problems_csv, sectionKey);

    logger.info(
      `Received ${inputData.pendingCodes?.length || 0} pending codes and processed them → ${results.readCodes.length} read codes, ` +
      `${results.createProblems.length} problems created, ` +
      `${results.attachProblems.length} attached`,
      logMeta
    );
    return;
  }

  // 1. Setting incoming codes
  logger.info(`Input letter codes count: ${inputData.letter_codes_list?.length || 0}`, logMeta);
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
  classifyReadCodes(codesMap, rules, results, pendingProblemAttachments, context, sectionKey, features);

  // 4. Processing problem attachments
  const problemsCsv = inputData.problems_csv || [];
  processProblemAttachments(
    results,
    pendingProblemAttachments,
    problemsCsv,
    rules,
    context,
    sectionKey,
    features,
  );

  context.addCandidate("readCodes", results.readCodes, sectionKey);
  context.addCandidate("createProblems", results.createProblems, sectionKey);
  context.addCandidate("attachProblems", results.attachProblems, sectionKey);
  context.addCandidate("pendingCodes", results.pendingCodes, sectionKey);
  context.addCandidate(
    "download_problems_csv",
    results.download_problems_csv,
    sectionKey
  );

  logger.info(
    `Done → ${results.readCodes.length} read codes, ` +
    `${results.createProblems.length} problems created, ` +
    `${results.attachProblems.length} attached, ` +
    `${results.pendingCodes.length} pending.`,
    logMeta
  );
};
