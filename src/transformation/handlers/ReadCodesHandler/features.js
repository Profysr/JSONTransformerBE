import { applyRule } from "../../evaluators/ApplyRule.js";

const isTrue = (v) => v === true || v === "true";

export const getFeatures = (inputData, rules, context, sectionKey) => {
    // Helper to evaluate a rule or return a default value
    const getFeature = (key, defaultValue) => {
        const val = applyRule(inputData, rules[key], key, {}, context, sectionKey);
        // If the rule returns null/undefined or 'skip', use the default
        if (val === null || val === undefined || val === "skip") {
            return defaultValue;
        }
        return isTrue(val);
    };

    return {
        use_inactive: getFeature("use_inactive", true),
        search_codes_in_problems: getFeature("search_codes_in_problems", false),
        override_bilateral: getFeature("override_bilateral", false),
    };
};
