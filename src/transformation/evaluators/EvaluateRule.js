import logger from "../../shared/logger.js";
import { evaluateCondition } from "./conditionEvaluator.js";
import { isEmpty } from "../../shared/utils/generalUtils.js";
import { ErrorHandler } from "../../api/middleware/errorHandler.js";

// ==================
// 1 Recursive Logical Evaluation
// ==================
export const evaluateRuleList = (
  inputData,
  rules,
  logicType,
  fieldKey,
  localContext = {},
  context = null,
  sectionKey = "",
) => {
  const logMeta = { sectionKey, functionName: "evaluateRuleList", fieldKey };
  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return new ErrorHandler(
      400,
      "Invalid or empty rules array in configuration.", logMeta,
    );
  }

  const result =
    logicType === "OR"
      ? rules.some((rule) =>
        evaluateRuleRecursive(
          inputData,
          rule,
          fieldKey,
          localContext,
          context,
          sectionKey,
        ),
      )
      : rules.every((rule) =>
        evaluateRuleRecursive(
          inputData,
          rule,
          fieldKey,
          localContext,
          context,
          sectionKey,
        ),
      );

  return result;
};

export const evaluateRuleRecursive = (
  inputData,
  rule,
  fieldKey,
  localContext = {},
  context = null,
  sectionKey = "",
) => {
  const logMeta = { sectionKey, functionName: "evaluateRuleRecursive", fieldKey };
  if (rule.type === "group") {
    logger.info(
      `Checking a combined rule group (Logic: ${rule.logicType})`,
      logMeta
    );

    if (!rule.rules || !Array.isArray(rule.rules)) {
      return new ErrorHandler(
        400,
        "Group rule missing 'rules' array in configuration.", logMeta
      );
    }

    return evaluateRuleList(
      inputData,
      rule.rules,
      rule.logicType,
      fieldKey,
      localContext,
      context,
      sectionKey,
    );
  }

  const result = evaluateCondition(
    inputData,
    rule,
    fieldKey,
    localContext,
    context,
    sectionKey
  );
  return result;
};

// ==================
// 2 Outcome Processing
// ==================
const evaluateClauseOutcome = (outcome, fieldKey, index, sectionKey = "") => {
  const logMeta = { sectionKey, functionName: "evaluateClauseOutcome", fieldKey };
  const isKilled = outcome.isKilled === true;
  logger.info(
    `Rule criteria met in clause ${index + 1}. with (KILL) option: ${isKilled}.`,
    logMeta
  );

  return {
    ...outcome,
    value: outcome.value === "skip" ? "true" : outcome.value,
    field: fieldKey,
    isKilled,
  };
};

// ==================
// 3 Cascading Logic Evaluation
// ==================
export const evaluateCascadingAdvanced = (
  inputData,
  fieldValue,
  fieldKey,
  localContext = {},
  context = null,
  sectionKey = "",
) => {
  const logMeta = { sectionKey, functionName: "evaluateCascadingAdvanced", fieldKey };

  // iterating conditions and passing to functions for evaluations
  for (const [index, clause] of fieldValue.clauses.entries()) {
    if (!clause || typeof clause !== "object" || !Array.isArray(clause.rules)) {
      return new ErrorHandler(
        400,
        `Clause ${index + 1} is invalid or missing rules array.`,
      );
    }

    logger.info(
      `Evaluating Clause ${index + 1} (Logic: ${clause.rootLogicType || "AND"})`,
      logMeta
    );

    const result = evaluateRuleList(
      inputData,
      clause.rules,
      clause.rootLogicType || "AND",
      fieldKey,
      localContext,
      context,
      sectionKey,
    );

    if (result) {
      return evaluateClauseOutcome(
        clause.outcome || {},
        fieldKey,
        index,
        sectionKey
      );
    } else {
      logger.info(`Condition not satisfied at Clause ${index + 1}`, logMeta);
    }
  }

  const elseBlock = fieldValue.else || {};
  const isKilled = elseBlock.isKilled === true;
  const elseValue = !isEmpty(elseBlock.value) ? elseBlock.value : "skip";

  logger.info(
    `No criteria met, using default value: ${elseValue}. Terminal (KILL): ${isKilled}`,
    logMeta
  );

  return {
    ...elseBlock,
    value: elseValue,
    field: fieldKey,
    isKilled,
  };
};
