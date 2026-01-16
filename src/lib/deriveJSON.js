import { isEmpty, trimString } from "../utils/utils.js";
import logger from "./logger.js";

/**
 * Recursively trims strings in the value.
 * Replaces "skip" with null.
 */
const cleanValue = (val, fieldId = "unknown") => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "skip" || trimmed === "<skip>") {
      logger.info(`[CleanValue][${fieldId}] Converted '${val}' to null`);
      return null;
    }
    return trimmed;
  }
  if (Array.isArray(val)) {
    return val.map(item => cleanValue(item, fieldId));
  }
  if (val !== null && typeof val === "object") {
    const newObj = {};
    Object.keys(val).forEach((key) => {
      newObj[key] = cleanValue(val[key], fieldId);
    });
    return newObj;
  }
  return val;
};

/**
 * Helper to process table field rows with deep tracing
 */
const processTableValue = (rows, columns, fieldId) => {
  if (!Array.isArray(rows) || !Array.isArray(columns)) {
    logger.error(`[Table: ${fieldId}] Validation failed: rows or columns are not arrays.`);
    return [];
  }

  const refinedRows = rows.map((row, index) => {
    const cleanRow = { ...row };

    for (const col of columns) {
      const colKey = trimString(col.key);

      /**
       * if a value is dependent and its parent has falsy, then delete the dependent value from the condition
       */
      if (col.dependsOn) {
        const depValue = trimString(row[col.dependsOn]);
        if (!depValue || depValue === "false") {
          logger.info(`[Table: ${fieldId}][Row: ${index}] Skipping column '${colKey}' as its parent '${col.dependsOn}' has falsy value ('${depValue}')`);
          // delete cleanRow[colKey];
          cleanRow[colKey] = "";
          continue;
        }
      }
      cleanRow[colKey] = cleanValue(row[colKey], `${fieldId}[${index}][${colKey}]`);
    }

    return cleanRow;
  });

  return refinedRows;
};

/** Major function, deriving JSON Values and normalize them */
export const deriveJSONRules = (config) => {
  const output = {};
  logger.info("Starting JSON derivation from configuration...");

  if (!config || !Array.isArray(config) || config.length === 0) {
    logger.error("Configuration is missing or not an array.");
    return output;
  }

  config.forEach((section) => {
    const sectionName = trimString(section.sectionKey) || "Unknown Section";
    logger.info(`Processing Section: `);

    const sectionData = {};
    let hasData = false;

    if (!section.fields || !Array.isArray(section.fields)) {
      logger.error(`Section  has no valid fields array.`);
      return;
    }

    section.fields.forEach((field) => {
      const fieldId = trimString(field.id);
      const fieldLogId = `Field: ${fieldId || "unnamed"}`;

      if (field.isActive === false) {
        logger.info(`[${fieldLogId}] Skipped: Inactive`);
        return;
      }

      let valueToInclude = field.value;

      /** Separate method for table. Using same for the rest types */
      if (field.type === "table") {
        const processedRows = processTableValue(field.value, field.columns, fieldId);

        if (!processedRows || processedRows.length === 0) {
          logger.info(`[${fieldLogId}] Table result empty, skipping field.`);
          return;
        }

        // TRIM APPLIED HERE: Column metadata keys
        let columns = field.columns
          .filter((curr) => curr.canConditional === true || !isEmpty(curr.dependsOn))
          .map((curr) => ({
            key: trimString(curr.key),
            dependsOn: trimString(curr.dependsOn),
            canConditional: curr.canConditional,
          }));

        valueToInclude = { columns, value: processedRows };
      } else {
        valueToInclude = cleanValue(valueToInclude, fieldId);
      }

      // Always include the field, even if value is empty/null
      sectionData[fieldId] = valueToInclude;
      hasData = true;
      logger.info(`[${fieldLogId}] Added to output`);
    });

    if (hasData && section.sectionKey) {
      output[trimString(section.sectionKey)] = sectionData;
    } else {
      logger.info(` No data found or sectionKey missing.`);
    }
  });

  logger.info("JSON derivation completed successfully.", output);
  return output;
};