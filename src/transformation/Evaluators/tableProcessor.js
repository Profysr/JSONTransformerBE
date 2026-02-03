import logger from "../../lib/logger.js";
import { applyRule } from "./ApplyRule.js";
import { isKilled, handleRuleResult } from "../../utils/transformationUtils.js";

export const processTableRules = (inputData, tableConfig, options = {}) => {
    const {
        sectionKey = "Unknown",
        context = null, // Added context to options
        onRowProcess = (row) => row,
        onRowSkip = null
    } = options;

    const rows = tableConfig?.value || [];
    const columns = tableConfig?.columns || [];

    // Map columns for O(1) metadata lookup
    const metaMap = new Map(columns.map(c => [c.id, c]));
    const primaryKeyCol = columns.find(c => c.isPrimaryKey)?.id;
    const parentFieldCol = columns.find(c => c.parentField)?.id;

    logger.info(`[${sectionKey}][Table] Processing ${rows.length} rules.`);

    const results = [];

    /** Helper to get row identification for logging */
    const getRowId = (row, index) => {
        if (primaryKeyCol && row[primaryKeyCol]) return row[primaryKeyCol];
        return `Index ${index}`;
    };

    /**
     * Evaluate field value only if canConditional is true
     */
    const evaluateField = (fieldKey, val, localRow = {}) => {
        const meta = metaMap.get(fieldKey) || {};
        if (meta.canConditional) {
            const result = applyRule(inputData, val, fieldKey, localRow, context);

            const source = `table:${sectionKey}`;
            if (handleRuleResult(fieldKey, result, context, source, localRow, { addToContext: false })) {
                return result; // Still return the kill result for upstream handling
            }

            return localRow[fieldKey];
        }
        return val;
    };

    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowId = getRowId(row, index);

        /**
         * 1. Evaluate "parentField" logic for skipping
         * The basic purpose of this: if add_codes = false and we wanna skip the row, we can use this field to skip the row.
         * But the complexity was, if the code already exist in our input, then we should need to remove it from there
         * But the best part is,  I'm passing onRowSkip as callback. So it is optional. Making our code dynamic 
         */ 
        if (parentFieldCol) {
            const shouldAddValue = evaluateField(parentFieldCol, row[parentFieldCol], row);

            /** Checking if automation needs to be killed or row should be skipped */
            if (isKilled(shouldAddValue)) {
                logger.warn(`[${sectionKey}][Table][${rowId}] Parent field triggered KILL.`);
                return { ...shouldAddValue, sectionKey, rowIdx: index };
            }

            if (shouldAddValue == false || shouldAddValue == "false" || shouldAddValue == "") {
                logger.info(`[${sectionKey}][Table][${rowId}] Skipping whole row as parent field has falsy value - ${shouldAddValue}`);
                if (onRowSkip) onRowSkip(row, inputData, { index });
                continue;
            }
        }

        // 2. Evaluate all other fields in the row based on metadata
        const processedRow = { ...row };
        let rowKilled = false;
        let killResult = null;

        /** evaluate values for the rows and pass it to callback function */
        for (const key of Object.keys(row)) {
            if (key === parentFieldCol || key === primaryKeyCol) continue;
            const val = evaluateField(key, row[key], row);

            if (isKilled(val)) {
                rowKilled = true;
                killResult = val;
                break;
            }
            processedRow[key] = val;
        }

        if (rowKilled) {
            logger.warn(`[${sectionKey}][Table][${rowId}] Field triggered KILL.`);
            return { ...killResult, sectionKey, rowIdx: index };
        }

        // 3. Delegate section-specific processing (e.g., BP splitting, forcedMappings)
        const outcome = onRowProcess(processedRow, inputData, { evaluateField, index });

        if (Array.isArray(outcome)) {
            results.push(...outcome);
        } else if (outcome) {
            results.push(outcome);
        }
    }

    // if (results.length > 0) {
    //     logger.info(`[${sectionKey}][Table] Produced ${results.length} items.`);
    // }
    return results;
};
