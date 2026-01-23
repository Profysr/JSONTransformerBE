import logger from "../../lib/logger.js";
import { applyRule } from "./ApplyRule.js";

export const processTableRules = (inputData, tableConfig, options = {}) => {
    const {
        sectionKey = "Unknown",
        skipField = "skip",
        identifierKey = null,
        context = null, // Added context to options
        onRowProcess = (row) => row,
        onRowSkip = null
    } = options;

    const rows = tableConfig?.value || [];
    const columns = tableConfig?.columns || [];

    // Map columns for O(1) metadata lookup
    const metaMap = new Map(columns.map(c => [c.key, c]));
    logger.info(`[${sectionKey}][Table] Processing ${rows.length} rules.`);

    const results = [];

    /**
     * Helper to get row identification for logging
     */
    const getRowId = (row, index) => {
        if (identifierKey && row[identifierKey]) return row[identifierKey];
        return `Row ${index}`;
    };

    /**
     * Evaluate field value only if canConditional is true
     */
    const evaluateField = (fieldKey, val, localRow = {}) => {
        const meta = metaMap.get(fieldKey) || {};
        if (meta.canConditional) {
            const result = applyRule(inputData, val, fieldKey, localRow);

            // Handle kill scenario immediately if it's a rule result
            if (result !== null && typeof result === "object" && result.isKilled === true) {
                return result;
            }

            let finalValue = result;

            // Handle result objects (Cascading Advanced)
            if (result !== null && typeof result === "object" && result.hasOwnProperty("value")) {
                finalValue = result.value;

                // Apply Matrix Assignments to context if available
                if (context && result.matrixAssignments) {
                    for (const [mKey, mVal] of Object.entries(result.matrixAssignments)) {
                        context.addCandidate(mKey, mVal, `matrix:${sectionKey}:${fieldKey}`);
                    }
                }

                // Apply Recipient Notes if available
                if (context && (result.notes)) {
                    context.addNote(result.notes);
                }
            }

            if (finalValue !== val) {
                const rowId = getRowId(localRow, rows.indexOf(localRow));
                logger.info(`[${sectionKey}][Table][${rowId}][${fieldKey}] Rule change: "${val}" -> "${finalValue}"`);
            }
            return finalValue;
        }
        return val;
    };

    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowId = getRowId(row, index);

        // 1. Evaluate "Should Skip" logic
        const shouldAddValue = evaluateField(skipField, row[skipField], row);

        console.log("ShouldAddValue: ", shouldAddValue);
        
        /**
         * Checking if automation needs to be killed or row should be skipped
         */
        if (shouldAddValue !== null && typeof shouldAddValue === "object" && shouldAddValue.isKilled === true) {
            logger.warn(`[${sectionKey}][Table][${rowId}] Skip field triggered KILL.`);
            return { ...shouldAddValue, sectionKey, rowIdx: index };
        }

        if (shouldAddValue == false || shouldAddValue == "false") {
            logger.info(`[${sectionKey}][Table][${rowId}] Row skipped.`);
            if (onRowSkip) onRowSkip(row, inputData, { index });
            continue;
        }

        // 2. Evaluate all other fields in the row based on metadata
        const processedRow = { ...row };
        let rowKilled = false;
        let killResult = null;

        /** evaluate values for the rows and pass it to callback function */
        for (const key of Object.keys(row)) {
            if (key === skipField) continue;
            const val = evaluateField(key, row[key], row);

            if (val !== null && typeof val === "object" && val.isKilled === true) {
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

    if (results.length > 0) {
        logger.info(`[${sectionKey}][Table] Produced ${results.length} items.`);
    }
    return results;
};
