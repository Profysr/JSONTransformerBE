import logger from "../../shared/logger.js";
import { handleRuleResult, isKilled } from "../utils/transformationUtils.js";
import { applyRule } from "./ApplyRule.js";

// ==================
// 1 Field Evaluation Logic
// ==================
/**
 * Evaluate field value only if canConditional is true
 */
const createFieldEvaluator = (metaMap, inputData, context, sectionKey) => {
  return (fieldKey, val, localRow = {}, logPrefix = null) => {
    const meta = metaMap.get(fieldKey) || {};
    if (meta.canConditional) {
      const result = applyRule(
        inputData,
        val,
        fieldKey,
        localRow,
        context,
        logPrefix,
      );

      const source = `table:${sectionKey}`;
      if (
        handleRuleResult(fieldKey, result, context, source, localRow, {
          addToContext: false,
          logPrefix,
        })
      ) {
        return result;
      }

      return localRow[fieldKey];
    }
    return val;
  };
};

// ==================
// 2 Table Processor Engine
// ==================
export const processTableRules = (inputData, tableConfig, options = {}) => {
  const {
    sectionKey = "Unknown",
    context = null,
    onRowProcess = (row) => row,
    onRowSkip = null,
  } = options;

  const rows = tableConfig?.value || [];
  const columns = tableConfig?.columns || [];

  const metaMap = new Map(columns.map((c) => [c.id, c]));
  const primaryKeyCol = columns.find((c) => c.isPrimaryKey)?.id;
  const parentFieldCol = columns.find((c) => c.parentField)?.id;

  logger.info(`Starting to evaluate ${rows.length} rules.`, { sectionKey, functionName: "processTableRules" });

  const evaluateField = createFieldEvaluator(
    metaMap,
    inputData,
    context,
    sectionKey,
  );
  const results = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];

    const rowId =
      primaryKeyCol && row[primaryKeyCol]
        ? row[primaryKeyCol]
        : `Row ${index + 1}`;

    const logPrefix = `[${sectionKey}][${rowId}]`;

    // a. Evaluate parentField logic
    if (parentFieldCol) {
      const shouldAddValue = evaluateField(
        parentFieldCol,
        row[parentFieldCol],
        row,
        logPrefix,
      );

      if (isKilled(shouldAddValue)) {
        logger.warn(
          "Aborted: Parent field triggered a termination (KILL).",
          { sectionKey, functionName: "processTableRules", fieldKey: rowId }
        );
        return { ...shouldAddValue, sectionKey, rowIdx: index };
      }

      if (
        shouldAddValue == false ||
        shouldAddValue == "false" ||
        shouldAddValue == ""
      ) {
        logger.info(
          `Skipped: Parent field '${parentFieldCol}' is not active.`,
          { sectionKey, functionName: "processTableRules", fieldKey: rowId }
        );
        if (onRowSkip) onRowSkip(row, inputData, { index });
        continue;
      }
    }

    // b. Evaluate all fields in the row
    const processedRow = { ...row };
    let rowKilled = false;
    let killResult = null;

    for (const key of Object.keys(row)) {
      if (key === parentFieldCol || key === primaryKeyCol) continue;
      const val = evaluateField(key, row[key], processedRow, logPrefix);

      if (isKilled(val)) {
        rowKilled = true;
        killResult = val;
        break;
      }
      processedRow[key] = val;
    }

    if (rowKilled) {
      logger.warn(
        `Aborted: Field '${killResult.field}' triggered a termination (KILL).`,
        { sectionKey, functionName: "processTableRules", fieldKey: rowId }
      );
      return { ...killResult, sectionKey, rowIdx: index };
    }

    // c. Handle notes
    if (
      processedRow.recipient_notes &&
      processedRow.recipient_notes !== "skip" &&
      context?.addNote
    ) {
      context.addNote(processedRow.recipient_notes);
    }

    // d. Process finalized row
    const outcome = onRowProcess(processedRow, inputData, {
      evaluateField,
      index,
    });


    if (Array.isArray(outcome)) {
      results.push(...outcome);
    } else if (outcome) {
      results.push(outcome);
    }
  }

  if (results.length > 0) logger.info(`Processed ${results.length} rows successfully.`, { sectionKey, functionName: "processTableRules" });
  return results;
};
