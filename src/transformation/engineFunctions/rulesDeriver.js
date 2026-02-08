import { ErrorHandler } from "../../api/middleware/errorHandler.js";
import { trimString } from "../../shared/utils/generalUtils.js";

// ==================
// 1 Helpers
// ==================
const cleanValue = (val) => {
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) return val.map((item) => cleanValue(item));
  if (val !== null && typeof val === "object") {
    return Object.fromEntries(
      Object.entries(val).map(([key, value]) => [key, cleanValue(value)])
    );
  }
  return val;
};

// ==================
// 2 Table Field Processing
// ==================
const processTableValue = (rows, columns, fieldId) => {
  if (!Array.isArray(rows) || !Array.isArray(columns)) {
    return new ErrorHandler(
      400,
      `[Table: ${fieldId}] Validation failed: 'rows' or 'columns' must be arrays.`
    );
  }

  return rows.map((row) => {
    const cleanRow = { ...row };

    for (const col of columns) {
      const colKey = trimString(col.id);
      if (!colKey) continue;

      if (col.dependsOn) {
        const depValue = row[col.dependsOn];
        if (!depValue || depValue === "false" || depValue === false) {
          cleanRow[colKey] = "";
          continue;
        }
      }

      cleanRow[colKey] = cleanValue(row[colKey]);
    }

    return cleanRow;
  });
};

// ==================
// 3 Single Field Processing
// ==================
const processField = (field, fieldId) => {
  if (field.isActive === false) return undefined;

  let valueToInclude = field.value;

  if (field.type === "table" || field.type === "cards") {
    try {
      const processedRows = processTableValue(field.value, field.columns, fieldId);
      if (!processedRows || processedRows.length === 0) return undefined;

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
    } catch {
      return undefined;
    }
  } else {
    valueToInclude = cleanValue(valueToInclude);
  }

  return valueToInclude;
};

// ==================
// 4 Section Orchestration
// ==================
const processSection = (key, section) => {
  if (!section || typeof section !== "object" || !Array.isArray(section.fields)) {
    return null;
  }

  const sectionKey = trimString(section.sectionKey) || key;
  const sectionData = {};
  let hasData = false;

  section.fields.forEach((field) => {
    const fieldId = trimString(field.id);
    const valueToInclude = processField(field, fieldId);
    if (valueToInclude !== undefined) {
      sectionData[fieldId] = valueToInclude;
      hasData = true;
    }
  });

  return hasData && section.sectionKey
    ? { key: sectionKey, data: sectionData }
    : null;
};

// ==================
// 5 Main Rules Deriver
// ==================
export const deriveJSONRules = (config) => {
  if (!config || typeof config !== "object") {
    return new ErrorHandler(
      400,
      "Configuration data is missing or is not a valid object."
    );
  }

  const output = {};
  Object.entries(config).forEach(([key, section]) => {
    const processed = processSection(key, section);
    if (processed) output[processed.key] = processed.data;
  });

  return output;
};
