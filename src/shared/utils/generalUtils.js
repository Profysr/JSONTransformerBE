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
export const resolveVariable = (fieldValue, inputData, localContext = {}, fieldKey = "", context, sectionKey = "") => {
    if (!fieldValue || typeof fieldValue !== "string") {
        return fieldValue;
    }

    if (!fieldValue.includes("var(")) {
        return fieldValue;
    }

    const varMatch = fieldValue.match(/var\((.+)\)/);
    if (!varMatch || !varMatch[1]) {
        return fieldValue;
    }

    const inputVal = varMatch[1].trim();

    if (inputVal === fieldKey) {
        const existingVal = inputData[fieldKey];
        if (typeof existingVal === "string" && existingVal.includes(`var(${fieldKey})`)) {
            logger.warn(`Circular reference detected in inputData for '${fieldKey}'.`, { sectionKey, functionName: "resolveVariable", fieldKey: fieldKey });
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
        logger.warn(`Field '${inputVal}' is not found in input inputData`, { sectionKey, functionName: "resolveVariable", fieldKey: fieldKey });
        return false;
    } else {
        logger.info(`Found variable '${inputVal}' -> "${fieldVal}"`, { sectionKey, functionName: "resolveVariable", fieldKey: fieldKey });
    }

    return fieldVal;
};

// ==================
// 3 Recursive Resolution
// ==================
export const resolveDeep = (fieldValue, inputData, localContext = {}, fieldKey = "", context = null, sectionKey = "") => {
    if (isEmpty(fieldValue)) return fieldValue;

    if (typeof fieldValue === "string") {
        return resolveVariable(fieldValue, inputData, localContext, fieldKey, context, sectionKey);
    }

    if (Array.isArray(fieldValue)) {
        return fieldValue.map((item) => resolveDeep(item, inputData, localContext, fieldKey, context, sectionKey));
    }

    if (typeof fieldValue === "object") {
        const resolvedObj = {};
        for (const [k, v] of Object.entries(fieldValue)) {
            resolvedObj[k] = resolveDeep(v, inputData, localContext, fieldKey, context, sectionKey);
        }
        return resolvedObj;
    }

    return fieldValue;
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
