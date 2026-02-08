import { ErrorHandler } from "../../api/middleware/errorHandler.js";
import { CONFIG } from "../../config/app.config.js";
import logger from "../../shared/logger.js";
import { trimString } from "../../shared/utils/generalUtils.js";


// ==================
// 1 Helpers & Logging
// ==================
const displayLogs = (msg, type = "info") => {
  if (CONFIG.nodeEnv.includes("production")) return;

  if (type === "info") {
    logger.info(msg);
  } else if (type === "error") {
    logger.log("error", msg);
  } else if (type === "warn") {
    logger.warn(msg);
  }
};

// ==================
// 2 Data Cleaning Logic
// ==================
/**
 * Recursively trims strings in the value.
 */
const cleanValue = (val, fieldId = "unknown") => {
  if (typeof val === "string") {
    return val.trim();
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

// ==================
// 3 Table Field Processing
// ==================
/**
 * Helper to process table field rows with deep tracing
 */
const processTableValue = (rows, columns, fieldId) => {
  if (!Array.isArray(rows) || !Array.isArray(columns)) {
    return new ErrorHandler(
      400,
      `[Table: ${fieldId}] Validation failed: 'rows' or 'columns' must be arrays.`,
    );
  }

  const refinedRows = rows.map((row, index) => {
    const cleanRow = { ...row };

    for (const col of columns) {
      const colKey = trimString(col.id);
      if (!colKey) continue;

      if (col.dependsOn) {
        const depValue = row[col.dependsOn];
        if (!depValue || depValue === "false" || depValue === false) {
          displayLogs(
            `[Table: ${fieldId}][Row: ${index}] Skipping column '${colKey}' as its parent '${col.dependsOn}' has falsy value ('${depValue}')`,
            "info",
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

// ==================
// 4 Single Field Processing
// ==================
/**
 * Processes an individual field within a section
 */
const processField = (field, fieldId, fieldLogId) => {
  if (field.isActive === false) {
    displayLogs(`[${fieldLogId}] Skipped: Inactive`, "info");
    return undefined;
  }

  let valueToInclude = field.value;

  /** Separate method for table. Using same for the rest types */
  if (field.type === "table" || field.type === "cards") {
    try {
      const processedRows = processTableValue(
        field.value,
        field.columns,
        fieldId,
      );

      if (!processedRows || processedRows.length === 0) {
        displayLogs(
          `[${fieldLogId}] Table result empty, skipping field.`,
          "info",
        );
        return undefined;
      }

      const columns = field.columns
        .map((curr) => ({
          id: trimString(curr.id || curr.key),
          canConditional: curr.canConditional ?? false,
          dependsOn: trimString(curr.dependsOn) ?? false,
          ...(curr.isPrimaryKey && { isPrimaryKey: curr.isPrimaryKey }),
          ...(curr.parentField && { parentField: curr.parentField }),
          ...(curr.options && { options: curr.options }),
        }))
        .filter((curr) => curr.id);

      valueToInclude = { columns, value: processedRows };
    } catch (tableErr) {
      logger.log(
        "error",
        `Failed to process table ${fieldId}: ${tableErr.message}`,
      );
      return undefined;
    }
  } else {
    valueToInclude = cleanValue(valueToInclude, fieldId);
  }

  return valueToInclude;
};

// ==================
// 5 Section Orchestration
// ==================
/**
 * Processes a single configuration section
 */
const processSection = (key, section) => {
  if (
    !section ||
    typeof section !== "object" ||
    !Array.isArray(section.fields)
  ) {
    displayLogs(`Skipping non-section attribute: ${key}`, "info");
    return null;
  }

  const sectionName =
    trimString(section.sectionKey) || key || "Unknown Section";
  displayLogs(`Processing Section: ${sectionName}`, "info");

  const sectionData = {};
  let hasData = false;

  section.fields.forEach((field) => {
    const fieldId = trimString(field.id);
    const fieldLogId = `Field: ${fieldId || "unnamed"}`;

    const valueToInclude = processField(field, fieldId, fieldLogId);

    if (valueToInclude !== undefined) {
      sectionData[fieldId] = valueToInclude;
      hasData = true;
      displayLogs(`[${fieldLogId}] Added to output`, "info");
    }
  });

  if (hasData && section.sectionKey) {
    return {
      key: trimString(section.sectionKey),
      data: sectionData,
    };
  } else {
    displayLogs(`No data found or sectionKey missing for ${key}.`, "warn");
    return null;
  }
};

// ==================
// 6 Main Rules Deriver
// ==================
/** Major function, deriving JSON Values and normalize them */
export const deriveJSONRules = (config) => {
  const output = {};

  displayLogs("Starting JSON derivation from configuration...", "info");

  if (!config || typeof config !== "object") {
    return new ErrorHandler(
      400,
      "Configuration data is missing or is not a valid object.",
    );
  }

  Object.entries(config).forEach(([key, section]) => {
    const processed = processSection(key, section);
    if (processed) {
      output[processed.key] = processed.data;
    }
  });

  displayLogs("JSON derivation completed successfully.", "info");
  return output;
};
