import logger from "../lib/logger.js";
import { evaluateCascadingAdvanced } from "./ruleEvaluator.js";

export const applyRule = (data, fieldValue, fieldKey) => {


    // 1. Check if the fieldValue is configured through advanced logic
    if (
        typeof fieldValue === "object" &&
        fieldValue !== null &&
        fieldValue.type === "cascading-advanced"
    ) {
        logger.info(`[${fieldKey}] Evaluating cascading-advanced condition rule`);
        const result = evaluateCascadingAdvanced(data, fieldValue, fieldKey);

        /** if isKilled true, return it */
        if (result.isKilled) {
            logger.warn(`[${fieldKey}] Rule resulted in KILL. Value: ${result.value}`);
            return { value: result.value, isKilled: true };
        }
        /** Reason: if we set variable in our outcome_else value. We've to make sure, If not killed, use the result value as the new fieldValue and continue evaluation */
        fieldValue = result.value;
    }

    // 2. Check if the fieldValue is a variable
    if (typeof fieldValue === "string") {
        fieldValue = fieldValue.trim();

        if (fieldValue.includes("var(")) {
            const varMatch = fieldValue.match(/var\((.+)\)/);
            if (varMatch && varMatch[1]) {
                /** for example: if we set 'letter_date: var(incident_date)', then letter_date is the fieldKey and incident_date is the sourceField */
                const sourceFieldPath = varMatch[1].trim();

                // Skip self-mapping (e.g., letter_date: var(letter_date))
                if (sourceFieldPath === fieldKey) {
                    logger.info(
                        `[${fieldKey}] Skipping self-mapping for field: ${fieldKey}`
                    );
                    return fieldValue;
                }

                logger.info(
                    `[${fieldKey}] Mapping '${fieldKey}' from variable '${sourceFieldPath}'`
                );

                // Resolve nested path
                const resolvedValue = sourceFieldPath
                    .split(".")
                    .reduce((acc, part) => (acc ? acc[part] : undefined), data);

                if (resolvedValue === undefined) {
                    logger.warn(
                        `[${fieldKey}] Variable '${sourceFieldPath}' not found in data, returning undefined`
                    );
                } else {
                    logger.info(
                        `[${fieldKey}] Resolved '${sourceFieldPath}' to: ${resolvedValue}`
                    );
                }

                return resolvedValue;
            }
        }
    }

    // 3. if property is already present, but still there's mapping required
    if (data.hasOwnProperty(fieldKey)) {
        logger.info(
            `[${fieldKey}] Mapping '${fieldKey}' with static value: '${fieldValue}'`
        );
        return fieldValue;
    }

    // 4. If fieldValue is not present in our JSON, just add it with the value
    logger.info(
        `[No property match] Adding '${fieldKey}' with value: '${fieldKey}'`
    );
    return fieldValue;
};
