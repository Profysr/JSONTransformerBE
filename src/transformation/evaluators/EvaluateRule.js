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
  logPrefix = null,
) => {
  const prefix = logPrefix || `[${fieldKey}]`;
  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return new ErrorHandler(
      400,
      `${prefix} Invalid or empty rules array in configuration.`,
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
          logPrefix,
        ),
      )
      : rules.every((rule) =>
        evaluateRuleRecursive(
          inputData,
          rule,
          fieldKey,
          localContext,
          context,
          logPrefix,
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
  logPrefix = null,
) => {
  const prefix = logPrefix || `[${fieldKey}]`;
  if (rule.type === "group") {
    logger.info(
      `Checking a combined rule group (Logic: ${rule.logicType})`,
      { sectionKey: "general", functionName: "evaluateRuleRecursive", fieldKey }
    );

    if (!rule.rules || !Array.isArray(rule.rules)) {
      return new ErrorHandler(
        400,
        `${prefix} Group rule missing 'rules' array in configuration.`,
      );
    }

    return evaluateRuleList(
      inputData,
      rule.rules,
      rule.logicType,
      fieldKey,
      localContext,
      context,
      logPrefix,
    );
  }

  const result = evaluateCondition(
    inputData,
    rule,
    fieldKey,
    localContext,
    context,
    logPrefix,
  );
  return result;
};

// ==================
// 2 Outcome Processing
// ==================
const evaluateClauseOutcome = (outcome, fieldKey, index) => {
  const isKilled = outcome.isKilled === true;
  logger.info(
    `Rule criteria met in clause ${index + 1}. Terminal (KILL): ${isKilled}`,
    { sectionKey: "general", functionName: "evaluateClauseOutcome", fieldKey }
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
  logPrefix = null,
) => {
  const prefix = logPrefix || `[${fieldKey}]`;
  for (const [index, clause] of fieldValue.clauses.entries()) {
    if (!clause || typeof clause !== "object" || !Array.isArray(clause.rules)) {
      return new ErrorHandler(
        400,
        `${prefix} Clause ${index + 1} is invalid or missing rules array.`,
      );
    }

    logger.info(
      `Evaluating Clause ${index + 1} (Logic: ${clause.rootLogicType || "AND"})`,
      { sectionKey: "general", functionName: "evaluateCascadingAdvanced", fieldKey }
    );

    const result = evaluateRuleList(
      inputData,
      clause.rules,
      clause.rootLogicType || "AND",
      fieldKey,
      localContext,
      context,
      logPrefix,
    );

    if (result) {
      return evaluateClauseOutcome(
        clause.outcome || {},
        fieldKey,
        index,
      );
    } else {
      logger.info(`Condition not satisfied at Clause ${index + 1}`, { sectionKey: "general", functionName: "evaluateCascadingAdvanced", fieldKey });
    }
  }

  const elseBlock = fieldValue.else || {};
  const isKilled = elseBlock.isKilled === true;
  const elseValue = !isEmpty(elseBlock.value) ? elseBlock.value : "skip";

  logger.info(
    `No criteria met, using default value: ${elseValue}. Terminal (KILL): ${isKilled}`,
    { sectionKey: "general", functionName: "evaluateCascadingAdvanced", fieldKey }
  );

  return {
    ...elseBlock,
    value: elseValue,
    field: fieldKey,
    isKilled,
  };
};
