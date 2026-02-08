import { isEmpty } from "../../shared/utils/generalUtils.js";

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
   * Trim whitespace
   */
  trim: (val) => {
    return typeof val === "string" ? val.trim() : val;
  },
};
