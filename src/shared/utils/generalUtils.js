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
            logger.warn(`Circular reference detected in inputData for '${fieldKey}'.`, { sectionKey: "general", functionName: "resolveVariable", fieldKey });
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
        logger.warn(`Field '${inputVal}' is not found in input inputData`, { sectionKey: "general", functionName: "resolveVariable", fieldKey });
        return false;
    } else {
        logger.info(`Found variable '${inputVal}' -> "${fieldVal}"`, { sectionKey: "general", functionName: "resolveVariable", fieldKey });
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

// ==================
// 5 Object Cleanup
// ==================
export const cleanObject = (obj) => {
    if (obj === null || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
        return obj
            .map(cleanObject)
            .filter((item) => item !== undefined && item !== null && item !== "skip");
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = cleanObject(value);
        if (cleanedValue !== undefined && cleanedValue !== null && cleanedValue !== "skip") {
            cleaned[key] = cleanedValue;
        }
    }
    return cleaned;
};
