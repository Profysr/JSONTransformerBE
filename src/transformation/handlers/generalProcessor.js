import { isEmpty } from "../../utils/util.js";
import { applyRule } from "../Evaluators/ApplyRule.js";

// There will be 2 kinda values -- object or a string.  if object, then there will be possibility of kill
export const processGeneralRules = (inputData, rules, context) => {
    for (const [fieldKey, fieldValue] of Object.entries(rules)) {
        const derivedValue = applyRule(inputData, fieldValue, fieldKey, {}, context);

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

            // 3. If it has a 'value' property, use that.
            if (!isEmpty(derivedValue.value)) {
                const actualVal = derivedValue.value;
                context.addCandidate(fieldKey, actualVal, `section:general`);
            }

            // 4. Handle Matrix Assignments
            if (derivedValue.matrixAssignments && typeof derivedValue.matrixAssignments === "object") {
                for (const [k, v] of Object.entries(derivedValue.matrixAssignments)) {
                    context.addCandidate(k, v, `matrix:${fieldKey}`);
                }
            }
            continue;
        }

        // Fallback for simple values (Static, table cells depending on logic)
        context.addCandidate(fieldKey, derivedValue, `section:general`);
    }
}
