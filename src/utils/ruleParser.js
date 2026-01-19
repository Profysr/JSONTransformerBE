import { isEmpty, trimString } from "./util.js";

/* -------------------------------------------------------
   Condition Parsing (Structured, Readable)
------------------------------------------------------- */

const parseConditionNode = (rule) => {
  if (!rule) return null;

  // Grouped logic
  if (rule.type === "group" && Array.isArray(rule.rules)) {
    return {
      type: "group",
      logic: trimString(rule.logicType || "AND"),
      children: rule.rules.map(parseConditionNode).filter(Boolean),
    };
  }

  // Simple condition
  const field = trimString(rule.field || "Unknown field");
  const operator = trimString((rule.operator || "is").replace(/_/g, " "));
  const value = trimString(rule.value);

  return {
    type: "rule",
    text: value ? `${field} ${operator} "${value}"` : `${field} ${operator}`,
  };
};

/* -------------------------------------------------------
   Outcome → Actions (UNCHANGED)
------------------------------------------------------- */

const parseActions = (outcome) => {
  const actions = [];

  if (!outcome) return actions;

  // Value handling
  if (outcome.value === "skip") {
    actions.push({ type: "skip" });
  } else if (outcome.value) {
    actions.push({
      type: "set_value",
      text: trimString(outcome.value),
    });
  }

  // Kill automation
  if (outcome.isKilled) {
    actions.push({
      type: "kill",
      batch: trimString(outcome.batch_name || "Unknown"),
    });
  }

  // Notes
  if (outcome.notes) {
    actions.push({
      type: "note",
      text: trimString(outcome.notes),
    });
  }

  // Matrix assignments (RAW, trimmed)
  if (
    outcome.matrixAssignments &&
    Object.keys(outcome.matrixAssignments).length
  ) {
    const assignments = {};

    Object.entries(outcome.matrixAssignments).forEach(([key, value]) => {
      const k = trimString(key);
      const v = trimString(value);
      if (k && v) assignments[k] = v;
    });

    if (Object.keys(assignments).length) {
      actions.push({
        type: "assignments",
        values: assignments,
      });
    }
  }

  return actions;
};

/* -------------------------------------------------------
   Advanced (Cascading) Logic Parser (UPDATED)
------------------------------------------------------- */

const parseAdvancedLogic = (field) => {
  const clauses = field?.value?.clauses || [];
  const rules = [];

  clauses.forEach((clause, index) => {
    rules.push({
      when: {
        keyword: index === 0 ? "IF" : "ELSE IF",
        logic: trimString(clause.rootLogicType || "AND"),
        conditions: clause.rules.map(parseConditionNode).filter(Boolean),
      },
      then: {
        actions: parseActions(clause.outcome),
      },
    });
  });

  return {
    type: "advanced",
    rules,
    else: {
      actions: parseActions(field?.value?.else),
    },
  };
};

/* -------------------------------------------------------
   Table Parser
------------------------------------------------------- */

// ...existing code...

const parseTable = (field) => {
  if (!Array.isArray(field.value)) {
    return {
      type: "table",
      text: "Invalid table data.",
      rows: [],
    };
  }

  // Filter to valid rows (objects, not arrays or null)
  const validRows = field.value.filter(
    (row) => row && typeof row === "object" && !Array.isArray(row),
  );

  if (validRows.length === 0) {
    return {
      type: "table",
      text: "Table is empty.",
      rows: [],
    };
  }

  const rows = validRows.map((row, index) => {
    // Try to find a human-readable title (first meaningful column)
    let rowTitle = `Row ${index + 1}`;
    const keys = Object.keys(row);
    const keyColumn =
      keys.find((k) => k !== "id" && k !== "addCode") || keys[0]; // Heuristic for title

    if (typeof row[keyColumn] === "string" && trimString(row[keyColumn])) {
      rowTitle = trimString(row[keyColumn]);
    }

    const details = {};
    keys.forEach((key) => {
      if (key === "id") return; // Skip internal ID

      // Clean value and only include strings
      const val = trimString(row[key]);
      if (
        typeof val === "string" &&
        val !== "" &&
        val !== null &&
        val !== undefined
      ) {
        details[key] = val;
      }
    });

    return {
      title: rowTitle,
      details: details,
    };
  });

  return {
    type: "table",
    rowCount: validRows.length,
    rows: rows,
  };
};

/* -------------------------------------------------------
   Field Parser (ENTRY POINT PER FIELD)
------------------------------------------------------- */

const parseField = (field) => {
  try {
    const id = trimString(field.id);
    const label = trimString(field.label);

    // TABLE
    if (field.type === "table") {
      return {
        id,
        label,
        output: parseTable(field),
      };
    }

    // ADVANCED LOGIC (Cascading)
    if (field.value && field.value.type === "cascading-advanced") {
      return {
        id,
        label,
        output: parseAdvancedLogic(field),
      };
    }

    // SIMPLE VALUE / FALLBACK
    // (Includes logic_input with simple value, boolean, dropdown, input)
    return {
      id,
      label,
      output: {
        type: "simple",
        text: `Use this value "${trimString(field.value) || ""}"`,
      },
    };
  } catch (error) {
    console.error(`Error parsing field '${field?.id}':`, error);
    return {
      id: field?.id || "unknown_error",
      label: field?.label || "Error",
      output: {
        type: "error",
        text: `Failed to parse field: ${error.message}`,
      },
    };
  }
};

/* -------------------------------------------------------
   Section Parser
------------------------------------------------------- */

const parseSection = (section, options) => {
  if (!Array.isArray(section.fields)) return null;

  let fields = section.fields;

  if (!options.includeInactive) {
    fields = fields.filter((f) => f.isActive === true);
  }

  if (!fields.length) return null;

  fields = fields.filter((f) => !isEmpty(f.value));
  return fields.map(parseField);
};

/* -------------------------------------------------------
   MAIN EXPORT
------------------------------------------------------- */

export const parseConfiguration = (
  config,
  options = { includeInactive: false },
) => {
  if (!Array.isArray(config)) return [];

  return config
    .map((section) => parseSection(section, options))
    .flat()
    .filter(Boolean);
};
