import logger from "../lib/logger.js";

/**
 * Trims value if it's a string, otherwise returns value as-is
 */
export const trimString = (val) => (typeof val === "string" ? val.trim() : val);

/**
 * Check if a value is empty (null, undefined, or empty string)
 */
export const isEmpty = (val) => {
    if (val === undefined || val === null || val === "") return true;
    const trimmed = trimString(val);
    if (typeof trimmed === "string") return trimmed.length === 0;
    return false;
};


/**
 * Resolve a variable reference (var(...)) from input inputData or localContext
 */
export const resolveVariable = (varString, inputData, localContext = {}, fieldKey = "") => {
    if (!varString || typeof varString !== "string") {
        return varString;
    }

    // Check if it contains var()
    if (!varString.includes("var(")) {
        return varString;
    }

    const varMatch = varString.match(/var\((.+)\)/);
    /**
     * var(letter_type) ===> varMatch = var(letter_type) And varMatch[1] = letter_type
     */
    if (!varMatch || !varMatch[1]) {
        return varString;
    }

    const inputVal = varMatch[1].trim();

    /**
     * if the inputVal is exactly the same as the fieldKey AND the value in inputData
     * is already a var string pointing to itself, we should try to resolve it from the original input.
     * However, the current engine logic basically says "if I'm mapping letter_type to letter_type, just use what's in inputData".
     */
    if (inputVal === fieldKey) {
        const existingVal = inputData[fieldKey];
        if (typeof existingVal === "string" && existingVal.includes(`var(${fieldKey})`)) {
            logger.warn(`[${fieldKey}] Circular reference detected in inputData for '${fieldKey}'.`);
            return existingVal;
        }
        return existingVal;
    }

    // Tries to resolve a nested property path ("inputData.letter_type")
    let fieldVal = inputVal
        .split(".")
        .reduce((acc, part) => (acc ? acc[part] : undefined), localContext);

    if (fieldVal === undefined) {
        fieldVal = inputVal
            .split(".")
            .reduce((acc, part) => (acc ? acc[part] : undefined), inputData);
    }

    if (fieldVal === undefined) {
        logger.warn(`[${fieldKey}] Field '${inputVal}' is not found in input inputData`);
        return false;
    } else {
        logger.info(`[${fieldKey}] Found variable '${inputVal}' -> "${fieldVal}"`);
    }

    return fieldVal;
};

/**
 * Recursively resolves variables in strings, arrays, and objects.
 */
export const resolveDeep = (value, inputData, localContext = {}, fieldKey = "") => {
    if (isEmpty(value)) return value;

    if (typeof value === "string") {
        return resolveVariable(value, inputData, localContext, fieldKey);
    }

    if (Array.isArray(value)) {
        return value.map((item) => resolveDeep(item, inputData, localContext, fieldKey));
    }

    if (typeof value === "object") {
        const resolvedObj = {};
        for (const [k, v] of Object.entries(value)) {
            resolvedObj[k] = resolveDeep(v, inputData, localContext, fieldKey);
        }
        return resolvedObj;
    }

    return value;
};

/**
 * Normalize boolean-like values to actual boolean
 */
export const toBoolean = (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true";
    }
    return Boolean(value);
};
