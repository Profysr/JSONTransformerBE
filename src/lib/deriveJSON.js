import { CONFIG } from "../global/AppConfig.js";
import { isEmpty, trimString } from "../utils/util.js";
import logger from "./logger.js";

const displayLogs = (msg, type = "info") => {
  if (CONFIG.nodeEnv.includes("production")) return;

  if (type === "info") {
    logger.info(msg);
  } else if (type === "error") {
    logger.error(msg);
  } else if (type === "warn") {
    logger.warn(msg);
  }
};

/**
 * Recursively trims strings in the value.
 * Replaces "skip" with null.
 */
const cleanValue = (val, fieldId = "unknown") => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed;
  }
  if (Array.isArray(val)) {
    return val.map((item) => cleanValue(item, fieldId));
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
    throw new Error(
      `[Table: ${fieldId}] Validation failed: 'rows' or 'columns' must be arrays.`,
    );
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
          displayLogs(
            `[Table: ${fieldId}][Row: ${index}] Skipping column '${colKey}' as its parent '${col.dependsOn}' has falsy value ('${depValue}')`,
            "info"
          );
          cleanRow[colKey] = "";
          continue;
        }
      }

      cleanRow[colKey] = cleanValue(
        row[colKey],
        `${fieldId}[${index}][${colKey}]`,
      );
    }

    return cleanRow;
  });

  return refinedRows;
};

/** Major function, deriving JSON Values and normalize them */
export const deriveJSONRules = (config) => {
  const output = {};
displayLogs("Starting JSON derivation from configuration...", "info");
  if (!config || !Array.isArray(config) || config.length === 0) {
    throw new Error("Configuration data is missing or is not a valid array.");
  }

  config.forEach((section) => {
    const sectionName = trimString(section.sectionKey) || "Unknown Section";
    displayLogs(`Processing Section: ${sectionName}`, "info");

    const sectionData = {};
    let hasData = false;

    if (!section.fields || !Array.isArray(section.fields)) {
      throw new Error(`Section '${sectionName}' has no valid fields array.`);
    }

    section.fields.forEach((field) => {
      const fieldId = trimString(field.id);
      const fieldLogId = `Field: ${fieldId || "unnamed"}`;

      if (field.isActive === false) {
        displayLogs(`[${fieldLogId}] Skipped: Inactive`, "info");
        return;
      }

      let valueToInclude = field.value;

      /** Separate method for table. Using same for the rest types */
      if (field.type === "table") {
        const processedRows = processTableValue(
          field.value,
          field.columns,
          fieldId,
        );

        if (!processedRows || processedRows.length === 0) {
          displayLogs(`[${fieldLogId}] Table result empty, skipping field.`, "info");
          return;
        }

        // TRIM APPLIED HERE: Column metadata keys
        let columns = field.columns
          .filter(
            (curr) => curr.canConditional === true || !isEmpty(curr.dependsOn),
          )
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
      displayLogs(`[${fieldLogId}] Added to output`, "info");
    });

    if (hasData && section.sectionKey) {
      output[trimString(section.sectionKey)] = sectionData;
    } else {
      displayLogs(`No data found or sectionKey missing.`, "warn");
    }
  });

  displayLogs("JSON derivation completed successfully.", "info");
  return output;
};
