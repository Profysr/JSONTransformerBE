/**
 * TransformFunctions.js
 */

export const TransformFunctions = {
    /**
     * Convert any value to boolean
     */
    toBoolean: (val) => {
        if (typeof val === "boolean") return val;
        if (typeof val === "string") return val.toLowerCase() === "true";
        return Boolean(val);
    },

    /**
     * Convert to string representation
     */
    toString: (val) => String(val),

    /**
     * Identity function (no transformation)
     */
    identity: (val) => val,

    /**
     * Extract numeric values from strings (e.g., "120/80" -> "120/80", "Height: 180cm" -> "180")
     */
    extractNumeric: (val) => {
        if (typeof val !== "string") return val;
        const match = val.match(/-?\d+(\.\d+)?/g);
        return match ? match.join("/") : "";
    },

    /**
     * Convert isMajor boolean to severity string
     * Usage: {{isMajor|mapSeverity}}
     */
    mapSeverity: (val) => {
        return (val === true || val === "true") ? "Major" : "Minor";
    },

    /**
     * Alias for mapSeverity (for backward compatibility or clarity)
     */
    majorToSeverity: (val) => {
        return (val === true || val === "true") ? "Major" : "Minor";
    },

    /**
     * Convert severity string to isMajor boolean
     */
    severityToMajor: (val) => {
        return val === "Major";
    }
};
