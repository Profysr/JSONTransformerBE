import { applyTemplate } from "../../engineFunctions/TemplateEngine.js";

export const buildReadCodeObj = (data, rules, context, sectionKey = "", fieldKey = "") => {
    const template = {
        child: { field: "child" },
        c_term: { field: "c_term" },
        snomed_code: { field: "snomed_code" },
        comments: { field: "comments" },
        // add_start_date: { field: "add_read_code_date" },
        start_date: {
            field: "read_code_date_type",
            condition: { field: "add_read_code_date", operator: "contains", value: "true" },
        },

        promote_problem: { field: "promote_problem" },
        put_summary: { field: "put_summary" },
        problem_severity: { field: "problem_severity" },

        promote_until_duration: { field: "promote_until_duration" },
        summary_until_duration: { field: "summary_until_duration" },
    };

    const obj = applyTemplate(template, data, context, sectionKey, fieldKey);

    if (obj.promote_problem || obj.put_summary) {
      obj.special_treatment = true;
    }

    return obj;
};

export const buildCreateProblemObj = (data, rules, context, sectionKey = "", fieldKey = "") => {
    const template = {
      child: { field: "child" },
      c_term: { field: "c_term" },
      snomed_code: { field: "snomed_code" },
      comments: { field: "comments" },
      add_start_date: { field: "add_read_code_date" },
      start_date: {
        field: "read_code_date_type",
        condition: {
          field: "add_read_code_date",
          operator: "contains",
          value: "true",
        },
      },
      problem_severity: { field: "problem_severity" },
      add_problem_end_date: { field: "add_problem_end_date" },
      problem_end_date_duration: {
        field: "problem_end_date_duration",
        condition: {
          field: "add_problem_end_date",
          operator: "contains",
          value: "true",
        },
      },
      use_inactive: { field: "use_inactive" },
    };

    return applyTemplate(template, data, context, sectionKey, fieldKey);
};
