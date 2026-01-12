/**
 * TransformFunctions.js
 * 
 * Centralized transform functions used by TemplateEngine for output shaping.
 */

// Extract numeric values from strings (e.g., "120 mg" -> "120")
export const extractNumeric = (val) => {
    if (typeof val !== "string") return val;
    const match = val.match(/-?\d+(\.\d+)?/g);
    return match ? match.join("/") : "";
};

// Convert value to boolean
export const toBoolean = (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true";
    }
    return Boolean(value);
};

// Convert value to string
export const toString = (val) => String(val);

// Map isMajor boolean to severity string
export const mapSeverity = (isMajor) => {
    return (isMajor === true || isMajor === "true") ? "Major" : "Minor";
};

export const TransformFunctions = {
    extractNumeric,
    toBoolean,
    toString,
    mapSeverity
};
