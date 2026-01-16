import logger from "../lib/logger.js";
import { applyRule } from "./ApplyRule.js";
import { resolveValue } from "../lib/evaluateConditions.js";

// There will be 2 kinda values -- object or a string.  if object, then there will be possibility of kill
export const processGeneralRules = (inputData, rules, context) => {
    for (const [fieldKey, fieldValue] of Object.entries(rules)) {
        const derivedValue = applyRule(inputData, fieldValue, fieldKey);

        // Check for rich object (Result from Advanced Logic)
        if (derivedValue && typeof derivedValue === "object") {
            // 1. Check Kill
            if (derivedValue.isKilled === true) {
                context.setKilled({
                    ...derivedValue,
                    isKilled: true,
                    field: fieldKey,
                });
                return;
            }

            // 2. Extract Notes
            if (derivedValue.notes) {
                context.addNote(derivedValue.notes);
            }

            // 3. Extract Value (Multiple Assignment Support)
            // If it has a 'value' property, use that.
            if (derivedValue.value !== undefined) {
                const actualVal = derivedValue.value;

                if (typeof actualVal === "object" && actualVal !== null) {
                    // Multiple Assignments: { "flag": "true", "color": "red" }
                    // Iterate and add candidate for EACH property
                    for (const [k, v] of Object.entries(actualVal)) {
                        context.addCandidate(k, v, `rule:${fieldKey}`);
                        logger.info(`[${fieldKey}] Multiple assignment: ${k} = ${v}`);
                    }
                } else {
                    // Single Assignment
                    context.addCandidate(fieldKey, actualVal, `section:general`);
                }
            }

            // 4. Handle Matrix Assignments
            if (derivedValue.matrixAssignments && typeof derivedValue.matrixAssignments === "object") {
                for (const [k, v] of Object.entries(derivedValue.matrixAssignments)) {
                    const resolvedV = resolveValue(v, inputData, {}, `matrix:${fieldKey}`);
                    context.addCandidate(k, resolvedV, `matrix:${fieldKey}`);
                    logger.info(`[${fieldKey}] Matrix assignment: ${k} = ${resolvedV}`);
                }
            }
            continue;
        }

        // Fallback for simple values (Static, table cells depending on logic)
        context.addCandidate(fieldKey, derivedValue, `section:general`);
    }
}
