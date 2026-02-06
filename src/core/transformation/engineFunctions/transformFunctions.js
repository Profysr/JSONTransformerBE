import { isEmpty } from "../../../shared/utils/generalUtils.js";

/**
 * Centralized library for all data transformation logic.
 * These can be referenced in output templates by name (e.g., transform: "extractNumeric").
 */
export const TransformFunctions = {
    /**
     * Extracts numeric values from a string (e.g., "120/80" -> "120/80", "70kg" -> "70")
     */
    extractNumeric: (val) => {
        if (typeof val !== "string") return val;
        const match = val.match(/-?\d+(\.\d+)?/g);
        return match ? match.join("/") : "";
    },

    /**
     * Converts value to a boolean
     */
    toBoolean: (val) => {
        if (typeof val === "boolean") return val;
        if (typeof val === "string") {
            const lower = val.toLowerCase().trim();
            return lower === "true" || lower === "yes" || lower === "1";
        }
        return !!val;
    },

    /**
     * Ensures value is a string ("true" instead of true)
     */
    toString: (val) => {
        if (isEmpty(val)) return "";
        return String(val);
    },

    /**
     * Maps boolean severity to Major/Minor
     */
    mapSeverity: (val) => {
        if (typeof val === "string") {
            const lower = val.toLowerCase().trim();
            if (lower === "major") return "Major";
            if (lower === "minor") return "Minor";
        }
        const isMajor = TransformFunctions.toBoolean(val);
        return isMajor ? "Major" : "Minor";
    },

    /**
     * Trim whitespace
     */
    trim: (val) => {
        return typeof val === "string" ? val.trim() : val;
    },

    /**
     * Internal helper to parse various date formats
     */
    _parseDate: (dateStr) => {
        let date;
        let format = "ISO";

        if (dateStr.includes("-")) {
            date = new Date(dateStr);
            format = "ISO";
        } else if (dateStr.includes("/")) {
            const parts = dateStr.split("/");
            if (parts.length === 3) {
                date = new Date(parts[2], parts[1] - 1, parts[0]);
                format = "UK";
            } else {
                date = new Date(dateStr);
            }
        } else {
            date = new Date(dateStr);
        }
        return { date, format };
    },

    /**
     * Internal helper to format dates back to string
     */
    _formatDate: (date, format) => {
        if (isNaN(date.getTime())) return "";
        const pad = (num) => String(num).padStart(2, "0");

        if (format === "ISO") {
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        } else if (format === "UK") {
            return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
        }

        return date.toISOString().split("T")[0];
    },

    /**
     * Adds months to a date string, preserving the format (ISO or DD/MM/YYYY)
     */
    addMonths: (val, context) => {
        const useEndDate = TransformFunctions.toBoolean(context.add_endDate);
        const startDateStr = context.date_type;
        const months = parseInt(val);
        if (!useEndDate || !startDateStr || isNaN(months)) return "skip";

        const { date, format } = TransformFunctions._parseDate(startDateStr);
        if (isNaN(date.getTime())) return "";

        date.setMonth(date.getMonth() + months);
        return TransformFunctions._formatDate(date, format);
    }
};
