import { CONFIG } from "../global/AppConfig.js";
import { isEmpty, trimString } from "../utils/util.js";
import logger from "./logger.js";
import { ErrorHandler } from "../middleware/errorHandler.js";

const displayLogs = (msg, type = "info") => {
  if (CONFIG.nodeEnv.includes("production")) return;

  if (type === "info") {
    logger.info(msg);
  } else if (type === "error") {
    logger.log("error", msg); // Use log directly to avoid the potential of throwing if we changed logger again
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
    return new ErrorHandler(400, `[Table: ${fieldId}] Validation failed: 'rows' or 'columns' must be arrays.`);
  }

  const refinedRows = rows.map((row, index) => {
    const cleanRow = { ...row };

    for (const col of columns) {
      const colKey = trimString(col.id);
      if (!colKey) continue;

      /**
       * if a value is dependent and its parent has falsy, then delete the dependent value from the condition
       */
      if (col.dependsOn) {
        const depValue = row[col.dependsOn];
        if (!depValue || depValue === "false" || depValue === false) {
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

  if (!config || typeof config !== "object") {
    return new ErrorHandler(400, "Configuration data is missing or is not a valid object.");
  }

  Object.entries(config).forEach(([key, section]) => {
    // Basic validation: skip properties that are not section objects (must have fields array)
    if (!section || typeof section !== "object" || !Array.isArray(section.fields)) {
      displayLogs(`Skipping non-section attribute: ${key}`, "info");
      return;
    }

    const sectionName = trimString(section.sectionKey) || key || "Unknown Section";
    displayLogs(`Processing Section: ${sectionName}`, "info");

    const sectionData = {};
    let hasData = false;

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
        try {
          const processedRows = processTableValue(
            field.value,
            field.columns,
            fieldId,
          );

          if (!processedRows || processedRows.length === 0) {
            displayLogs(`[${fieldLogId}] Table result empty, skipping field.`, "info");
            return;
          }

          // Extract relevant column metadata
          let columns = field.columns
            .map((curr) => ({
              id: trimString(curr.id || curr.key),
              canConditional: curr.canConditional ?? false,
              dependsOn: trimString(curr.dependsOn) ?? false,
              ...(curr.isPrimaryKey && { isPrimaryKey: curr.isPrimaryKey }),
              ...(curr.parentField && { parentField: curr.parentField }),
              ...(curr.options && { options: curr.options }),
            }))
            .filter((curr) => curr.id); // Ensure we don't have empty IDs

          valueToInclude = { columns, value: processedRows };
        } catch (tableErr) {
          logger.log("error", `Failed to process table ${fieldId}: ${tableErr.message}`);
          return;
        }
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
      displayLogs(`No data found or sectionKey missing for ${key}.`, "warn");
    }
  });

  displayLogs("JSON derivation completed successfully.", "info");
  return output;
};
