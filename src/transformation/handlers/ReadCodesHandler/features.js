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
        link_diabetic_problem: getFeature("link_diabetic_problem", false),
        no_problem_csv_found: isTrue(inputData?.NoProblemCSVFound),
    };
    
    // for all codes be it diag, proce, read, move in pending codes,
    //  find in prob csv first of all
    // if we find it , attach
    // else follow default behaviour

    // if we have empty csv ? no record length of csv is 0
    // will send empty array and boolean will be sent, nocsv = true ,
    //  means no csv exists, it doesnt go to attach, only create or read code
};
