import logger from "./logger.js";
import { isEmpty, trimString } from "./utils.js";

/**
 * Helper to process table field rows with deep tracing
 */
const processTableValue = (rows, columns, fieldId) => {
  if (!Array.isArray(rows) || !Array.isArray(columns)) {
    logger.error(`[Table: ${fieldId}] Validation failed: rows or columns are not arrays.`);
    return [];
  }

  logger.info(`[Table: ${fieldId}] Processing ${rows.length} rows against ${columns.length} columns.`);

  return rows
    .map((row, index) => {
      const cleanRow = { ...row };

      for (const col of columns) {
        // Trim the key we are looking for just in case the column definition has whitespace
        const colKey = trimString(col.key);

        // Check dependency logic
        if (col.dependsOn) {
          const depValue = trimString(row[col.dependsOn]);
          if (!depValue || depValue === "false") {
            logger.info(`[Table: ${fieldId}][Row: ${index}] Skipping column '${colKey}' due to dependency '${col.dependsOn}'`);
            delete cleanRow[colKey];
            continue;
          }
        }

        const val = row[colKey];
        if (!isEmpty(val)) {
          // TRIM APPLIED HERE: For values within table rows
          cleanRow[colKey] = trimString(val);
        } else {
          logger.info(`[Table: ${fieldId}][Row: ${index}] Column '${colKey}' is empty or whitespace, excluding.`);
          delete cleanRow[colKey];
        }
      }

      return Object.keys(cleanRow).length > 0 ? cleanRow : null;
    })
    .filter((row) => row !== null);
};

/** Major function, deriving JSON Values and normalize them */
export const deriveJSONRules = (config) => {
  const output = {};
  logger.info("Starting JSON derivation from configuration...");

  if (!config || !Array.isArray(config) || config.length === 0) {
    logger.warn("Configuration is missing or not an array.");
    return output;
  }

  config.forEach((section) => {
    // TRIM APPLIED HERE: Section Key
    const sectionName = trimString(section.sectionKey) || "Unknown Section";
    logger.info(`Processing Section: [${sectionName}]`);

    const sectionData = {};
    let hasData = false;

    if (!section.fields || !Array.isArray(section.fields)) {
      logger.warn(`Section [${sectionName}] has no valid fields array.`);
      return;
    }

    section.fields.forEach((field) => {
      const fieldId = trimString(field.id);
      const fieldLogId = `Field: ${fieldId || 'unnamed'}`;

      if (field.isActive === false || field.isLocked) {
        logger.info(`[${sectionName}][${fieldLogId}] Skipped: Inactive or Locked.`);
        return;
      }

      let valueToInclude = field.value;

      if (field.type === "table") {
        logger.info(`[${sectionName}][${fieldLogId}] Entering table processing...`);
        const processedRows = processTableValue(field.value, field.columns, fieldId);

        if (!processedRows || processedRows.length === 0) {
          logger.info(`[${sectionName}][${fieldLogId}] Table result empty, skipping field.`);
          return;
        }

        // TRIM APPLIED HERE: Column metadata keys
        let columns = field.columns
          .filter(curr => curr.canConditional === true || !isEmpty(curr.dependsOn))
          .map(curr => ({
            key: trimString(curr.key),
            dependsOn: trimString(curr.dependsOn),
            canConditional: curr.canConditional
          }));

        valueToInclude = { columns, value: processedRows };
      } else {
        if (isEmpty(valueToInclude)) {
          logger.info(`[${sectionName}][${fieldLogId}] Skipping: Value is empty.`);
          return;
        }
        // TRIM APPLIED HERE: Standard field values
        valueToInclude = trimString(valueToInclude);
      }

      sectionData[fieldId] = valueToInclude;
      hasData = true;
      logger.info(`[${sectionName}][${fieldLogId}] Successfully added to output.`);
    });

    if (hasData && section.sectionKey) {
      output[trimString(section.sectionKey)] = sectionData;
    }
  });

  logger.info("JSON derivation completed successfully.");
  return output;
};