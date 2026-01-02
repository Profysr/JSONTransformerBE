import logger from "./logger.js";

export const deriveJSONRules = (config) => {
  const output = {};
  logger.info("Starting JSON derivation from configuration...");

  if (!config || !Array.isArray(config) || config.length === 0) {
    logger.warn("Configuration is missing or not an array.");
    return output;
  }

  const isEmpty = (val) => {
    if (val === undefined || val === null) return true;
    if (typeof val === "string") return val.trim().length === 0;
    return false;
  };

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
        const cleanRow = {};

        for (const col of columns) {
          // Check dependency logic
          if (col.dependsOn) {
            const depValue = row[col.dependsOn];
            if (!depValue || depValue === "false") {
              logger.info(`[Table: ${fieldId}][Row: ${index}] Skipping column '${col.key}' due to dependency '${col.dependsOn}' (Value: ${depValue})`);
              continue;
            }
          }

          const val = row[col.key];
          if (!isEmpty(val)) {
            cleanRow[col.key] = val;
          } else {
            logger.info(`[Table: ${fieldId}][Row: ${index}] Column '${col.key}' is empty, excluding.`);
          }
        }

        const hasContent = Object.keys(cleanRow).length > 0;
        if (!hasContent) {
          logger.info(`[Table: ${fieldId}][Row: ${index}] Row resulted in no valid data.`);
          return null;
        }

        return cleanRow;
      })
      .filter((row) => row !== null);
  };

  config.forEach((section) => {
    const sectionName = section.sectionKey || "Unknown Section";
    logger.info(`Processing Section: [${sectionName}]`);

    const sectionData = {};
    let hasData = false;

    if (!section.fields || !Array.isArray(section.fields)) {
      logger.warn(`Section [${sectionName}] has no valid fields array.`);
      return;
    }

    section.fields.forEach((field) => {
      const fieldLogId = `Field: ${field.id || 'unnamed'}`;

      // Exclude inactive fields
      if (field.isActive === false) {
        logger.info(`[${sectionName}][${fieldLogId}] Skipped: isActive is false.`);
        return;
      }

      // Exclude locked fields
      if (field.isLocked) {
        logger.info(`[${sectionName}][${fieldLogId}] Skipped: isLocked is true.`);
        return;
      }

      let valueToInclude = field.value;

      if (field.type === "table") {
        logger.info(`[${sectionName}][${fieldLogId}] Entering table processing...`);
        valueToInclude = processTableValue(field.value, field.columns, field.id);

        if (!valueToInclude || valueToInclude.length === 0) {
          logger.info(`[${sectionName}][${fieldLogId}] Table result empty, skipping field.`);
          return;
        }

        let columns = field.columns.map(curr => {
          return {
            key: curr.key,
            dependsOn: curr.dependsOn,
            canConditional: curr.canConditional
          }
        }).filter(curr => curr.canConditional == true || !isEmpty(curr.dependsOn));

        valueToInclude = { columns, value: valueToInclude }
      } else {
        if (isEmpty(valueToInclude)) {
          logger.info(`[${sectionName}][${fieldLogId}] Skipping: Value is empty.`);
          return;
        }
      }

      // Include the field value
      sectionData[field.id] = valueToInclude;
      hasData = true;
      logger.info(`[${sectionName}][${fieldLogId}] Successfully added to output.`);
    });

    if (hasData && section.sectionKey) {
      output[section.sectionKey] = sectionData;
      logger.info(`[${sectionName}] Section completed with ${Object.keys(sectionData).length} fields.`);
    } else {
      logger.info(`[${sectionName}] Section skipped: No valid data found.`);
    }
  });

  logger.info("JSON derivation completed successfully.", output);
  return output;
};