import logger from "./logger.js";

/**
 * Trims value if it's a string, otherwise returns value as-is
 */
export const trimString = (val) => (typeof val === "string" ? val.trim() : val);

/**
 * Check if a value is empty (null, undefined, or empty string)
 */
export const isEmpty = (val) => {
    if (val === undefined || val === null) return true;
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

    const keyToLookInInput = varMatch[1].trim();

    /**
     * if the fieldKey is the same as the keyToLookInInput then there's no need of mapping. It's same as we're mapping the letter_date value to letter_date field in input JSON
     */
    if (keyToLookInInput === fieldKey) {
        return varString;
    }

    // Tries to resolve a nested property path ("inputData.letter_type")
    let keyValueToMap = keyToLookInInput
        .split(".")
        .reduce((acc, part) => (acc ? acc[part] : undefined), localContext);

    if (keyValueToMap === undefined) {
        keyValueToMap = keyToLookInInput
            .split(".")
            .reduce((acc, part) => (acc ? acc[part] : undefined), inputData);
    }

    if (keyValueToMap === undefined) {
        logger.warn(`[${fieldKey}] Field '${keyToLookInInput}' is not found in input inputData`);
    } else {
        logger.info(`[${fieldKey}] Found variable '${keyToLookInInput}' -> "${keyValueToMap}"`);
    }

    return keyValueToMap;
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
