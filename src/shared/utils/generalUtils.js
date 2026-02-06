import logger from "../logger.js";

// ==================
// 1 String & Empty Helpers
// ==================
export const trimString = (val) => (typeof val === "string" ? val.trim() : val);

export const isEmpty = (val) => {
    if (val === undefined || val === null || val === "") return true;
    const trimmed = trimString(val);
    if (typeof trimmed === "string") return trimmed.length === 0;
    return false;
};

// ==================
// 2 Variable Resolution Logic
// ==================
export const resolveVariable = (varString, inputData, localContext = {}, fieldKey = "", context) => {
    if (!varString || typeof varString !== "string") {
        return varString;
    }

    if (!varString.includes("var(")) {
        return varString;
    }

    const varMatch = varString.match(/var\((.+)\)/);
    if (!varMatch || !varMatch[1]) {
        return varString;
    }

    const inputVal = varMatch[1].trim();

    if (inputVal === fieldKey) {
        const existingVal = inputData[fieldKey];
        if (typeof existingVal === "string" && existingVal.includes(`var(${fieldKey})`)) {
            logger.warn(`[${fieldKey}] Circular reference detected in inputData for '${fieldKey}'.`);
            return existingVal;
        }
        return existingVal;
    }

    let fieldVal = inputVal
        .split(".")
        .reduce((acc, part) => (acc ? acc[part] : undefined), localContext);

    if (fieldVal === undefined) {
        fieldVal = inputVal
            .split(".")
            .reduce((acc, part) => (acc ? acc[part] : undefined), inputData);
    }

    if (fieldVal === undefined && context && typeof context.getSnapshot === "function") {
        const snapshot = context.getSnapshot();
        fieldVal = inputVal
            .split(".")
            .reduce((acc, part) => (acc ? acc[part] : undefined), snapshot);
    }

    if (fieldVal === undefined) {
        logger.warn(`[${fieldKey}] Field '${inputVal}' is not found in input inputData`);
        return false;
    } else {
        logger.info(`[${fieldKey}] Found variable '${inputVal}' -> "${fieldVal}"`);
    }

    return fieldVal;
};

// ==================
// 3 Recursive Resolution
// ==================
export const resolveDeep = (value, inputData, localContext = {}, fieldKey = "", context = null) => {
    if (isEmpty(value)) return value;

    if (typeof value === "string") {
        return resolveVariable(value, inputData, localContext, fieldKey, context);
    }

    if (Array.isArray(value)) {
        return value.map((item) => resolveDeep(item, inputData, localContext, fieldKey, context));
    }

    if (typeof value === "object") {
        const resolvedObj = {};
        for (const [k, v] of Object.entries(value)) {
            resolvedObj[k] = resolveDeep(v, inputData, localContext, fieldKey, context);
        }
        return resolvedObj;
    }

    return value;
};

// ==================
// 4 Boolean Normalization
// ==================
export const toBoolean = (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true";
    }
    return Boolean(value);
};
