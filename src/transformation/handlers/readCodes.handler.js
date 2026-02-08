import logger from "../../shared/logger.js";
import { isEmpty } from "../../shared/utils/generalUtils.js";
import { applyTemplate } from "../engineFunctions/TemplateEngine.js";
import { applyRule } from "../evaluators/ApplyRule.js";
import { processTableRules } from "../evaluators/tableProcessor.js";

// ==================
// 1. Laterality Mapping Logic
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
  if (!comment || typeof comment !== "string" || mappingMap.size === 0)
    return comment;

  const words = comment.split(/(\b|\s+|[,.;:!])/);
  return words
    .map((word) => {
      const key = word.trim().toLowerCase();
      return mappingMap.has(key) ? mappingMap.get(key) : word;
    })
    .join("");
};

// ==================
// 2. Forced Mapping Logic
// ==================
const applyForcedMappings = (codesMap, mappings) => {
  mappings.forEach(({ from, to }) => {
    const codeObj = codesMap.get(from);
    if (!codeObj) return;

    logger.info(`[ReadCodes] Forced mapping: ${from} → ${to}`);
    codeObj.child = to;
    codesMap.delete(from);
    codesMap.set(to, codeObj);
  });
};

// ==================
// 3. Base Object Builders
// ==================

const buildReadCodeObj = (data, rules, context) => {
  const template = {
    child: { field: "child" },
    snomed_code: { field: "snomed_code" },
    comments: { field: "comments" },
    add_start_date: { field: "add_read_code_date" },
    start_date: {
      field: "read_code_date_type",
      condition: { field: "add_read_code_date", operator: "contains", value: "true" },
    },

    promote_problem: { field: "promote_problem" },
    put_summary: { field: "put_summary" },
    problem_severity: { field: "problem_severity" },

    promote_until_duration: { field: "promote_until_duration" },
    summary_until_duration: { field: "summary_until_duration" },
  };

  const obj = applyTemplate(template, data, context);

  if (obj.promote_until_duration || obj.summary_until_duration) {
    obj.add_read_code_expiry = true;
  }

  return obj;
};

const buildCreateProblemObj = (data, rules, context) => {
  const template = {
    child: { field: "child" },
    comments: { field: "comments" },
    add_start_date: { field: "add_read_code_date" },
    start_date: {
      field: "read_code_date_type",
      condition: { field: "add_read_code_date", operator: "contains", value: "true" },
    },
    problem_severity: { field: "problem_severity" },
    add_problem_end_date: { field: "add_problem_end_date" },
    problem_end_date_duration: {
      field: "problem_end_date_duration",
      condition: { field: "add_problem_end_date", operator: "contains", value: "true" },
    },
    use_inactive: { field: "use_inactive" },
  };

  return applyTemplate(template, data, context);
};

// ==================
// 4. Specific Codes Table Processing
// ==================
const updateCodesMapFromSpecificCodes = (
  inputData,
  specificCodesRules,
  codesMap,
  pendingForcedMappings,
  context,
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
// 5. Helpers
// ==================
const isTrue = (v) => v === true || v === "true";
const isFalse = (v) => v === false || v === "false";

const resolveProblemFlag = ({ isDiagnosis, globalValue, rowValue }) => {
  if (!isEmpty(rowValue)) {
    return isTrue(rowValue);
  }
  if (!isDiagnosis) return false;
  return globalValue;
};

const hasSpecialReadBehavior = (codeData) =>
  (codeData.promote_problem && codeData.promote_problem !== "skip") ||
  (codeData.put_summary && codeData.put_summary !== "skip");

// ==================
// 6. CLASSIFY READ CODES
// ==================
const classifyReadCodes = (
  codesMap,
  rules,
  results,
  pendingProblemAttachments,
  context,
) => {
  const globalAttach = isTrue(rules.attach_problem);
  const globalCreate = isTrue(rules.create_problem);

  logger.info(`[ReadCodes] Total codes in map: ${codesMap.size}. Starting classification.`);

  codesMap.forEach((codeData, childCode) => {
    if (isFalse(codeData.add_code)) return;

    const isDiagnosis = (codeData.type || "").toLowerCase() === "diagnosis";

    const shouldAttachProblem = resolveProblemFlag({
      isDiagnosis,
      globalValue: globalAttach,
      rowValue: codeData.attach_problem,
    });

    const allowProblemCreation = resolveProblemFlag({
      isDiagnosis,
      globalValue: globalCreate,
      rowValue: codeData.create_problem,
    });

    const allowReadCodeSpecial = hasSpecialReadBehavior(codeData);

    logger.info(`[ReadCodes][${childCode}] shouldAttach: ${shouldAttachProblem}, allowCreate: ${allowProblemCreation}, isSpecial: ${allowReadCodeSpecial}`);

    // 6.1 Attach-first path (deferred resolution)
    if (shouldAttachProblem) {
      pendingProblemAttachments.push({
        childCode,
        codeData,
        attachIfExists: true,
        allowProblemCreation,
        allowReadCodeSpecial,
      });
      return;
    }

    // 6.2 Direct create problem
    if (allowProblemCreation && !allowReadCodeSpecial) {
      results.createProblems.push(
        buildCreateProblemObj(codeData, rules, context),
      );
      return;
    }

    // 6.3 Read code (special or normal)
    results.readCodes.push(
      buildReadCodeObj(codeData, rules, context),
    );
  });
};

// ==================
// 7. Resolve Attachments
// ==================
const processProblemAttachments = (
  results,
  pendingProblemAttachments,
  problemsCsv,
  rules,
  context,
) => {
  // 1. If there are no pending problem attachments, return.
  if (pendingProblemAttachments.length === 0) return;

  // 2. If there are no problems in the CSV, return.
  if (!problemsCsv || problemsCsv.length === 0) {
    results.download_problems_csv = true;
    return;
  }

  // 3. Iterate over pending problem attachments.
  pendingProblemAttachments.forEach(
    ({ childCode, codeData, allowProblemCreation, allowReadCodeSpecial }) => {
      const index = problemsCsv.findIndex(
        (p) => p.code === childCode || p.readCode === childCode || p.child === childCode,
      );

      if (index !== -1) {
        results.attachProblems.push(index);
        return;
      }

      if (allowReadCodeSpecial) {
        results.readCodes.push(
          buildReadCodeObj(codeData, rules, context),
        );
      } else if (allowProblemCreation) {
        results.createProblems.push(
          buildCreateProblemObj(codeData, rules, context),
        );
      }
    },
  );
};

// ==================
// 8. Main Handler
// ==================
export const processReadCodes = (inputData, rules, context) => {
  logger.info("[ReadCodes] Starting analysis.");
  logger.info(`[ReadCodes] Input letter codes count: ${inputData.letter_codes_list?.length || 0}`);

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
    applyRule(inputData, rules.add_readcodes, "add_readcodes", {}, context);

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
    applyForcedMappings(codesMap, pendingForcedMappings);
  }

  // 3. Classifying read codes
  const pendingProblemAttachments = [];
  classifyReadCodes(codesMap, rules, results, pendingProblemAttachments, context);

  // 4. Processing problem attachments
  const problemsCsv = inputData.problems_csv || [];
  processProblemAttachments(
    results,
    pendingProblemAttachments,
    problemsCsv,
    rules,
    context,
  );

  context.addCandidate("readCodes", results.readCodes, "section:readCodes");
  context.addCandidate("createProblems", results.createProblems, "section:readCodes");
  context.addCandidate("attachProblems", results.attachProblems, "section:readCodes");
  context.addCandidate(
    "download_problems_csv",
    results.download_problems_csv,
    "section:readCodes",
  );

  logger.info(
    `[ReadCodes] Done → ${results.readCodes.length} read codes, ` +
    `${results.createProblems.length} problems created, ` +
    `${results.attachProblems.length} attached.`,
  );
};
