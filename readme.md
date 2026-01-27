# JSONTransformerBE: Advanced Logic Flow

This document provides a comprehensive overview of how advanced logic is configured and executed within the system, from the initial transformation trigger to the final field resolution.

---

## 1. Entry Point: Orchestration
The transformation starts in [transformerHelper.js](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/transformation/transformerHelper.js). It takes `inputData` and `configRules` and iterates through the defined sections (e.g., `metrics`, `readCodes`, or general fields).

- **Global Context**: A `TransformationContext` is initialized to hold final results and track state (like "kill" signals).
- **Handlers**: Depending on the section, it delegates to specialized processors:
    - [metricsHandler.js](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/transformation/handlers/metricsHandler.js) for `metrics`.
    - [readCodesHandler.js](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/transformation/handlers/readCodesHandler.js) for `readCodes`.
    - [generalProcessor.js](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/transformation/handlers/generalProcessor.js) for everything else.

## 2. Rule Iteration: The Rule Bridge
In [generalProcessor.js](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/transformation/handlers/generalProcessor.js), the system loops through every key in the configuration. For each field, it calls [applyRule](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/transformation/Evaluators/ApplyRule.js).

- **Rule Types**: `applyRule` determines if a field is a static value, a variable reference (`var(field)`), or if it contains **Advanced Logic** (`type: "cascading-advanced"`).
- **Delegation**: If advanced logic is detected, it hands off execution to `evaluateCascadingAdvanced`.

## 3. Evaluation Hierarchy: Clauses, Groups, and Conditions
The core logic evaluation happens in [EvaluateRule.js](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/transformation/Evaluators/EvaluateRule.js).

1.  **Cascading Clauses**: The engine iterates through `clauses` (If/Else-If blocks). The *first* clause to return `true` triggers its `outcome`.
2.  **Groups and Logic Types**: Within a clause, rules can be nested in "groups" with `logicType` ("AND" or "OR").
3.  **Recursion**: The `evaluateRuleList` function recursively evaluates these groups until it reaches individual **Condition Items**.

## 4. Deep Dive: Field Resolution (Confusion Cleared)
Before a condition can be checked, the engine must resolve the values for both the **Field** (left side) and the **Value** (right side). This happens in [EvaluateConditions.js](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/lib/EvaluateConditions.js) via the `resolveValue` function.

### A. Variables: `var(path)`
If a string matches the `var(...)` syntax, it is treated as an **Explicit Path**.
- **Process**: `resolveDeep` (in `util.js`) extracts the path inside the parentheses.
- **Lookup**: It first looks in regular input data, but can also resolve from a `localContext` if provided.
- **Example**: `var(patient.age)` will look for `{ "patient": { "age": 25 } }` in the input.

### B. Implicit Paths (Auto-Resolution)
If a string is *not* wrapped in `var()`, the engine treats it as an **Implicit Path** first.
- **Process**: Using `getValue` from `Operators.js`, the engine splits the string by `.` and tries to traverse the data.
- **Lookup Order**:
    1.  **Input Data**: The original input provided to the transformation.
    2.  **Global Context**: A snapshot of current "winning" candidates and the `notes` array.
- **Example**: `metrics.0.value` will automatically navigate the array and objects to find the value. `notes` will resolve to the current global notes array.

### C. Literals: Constants
The system distinguishes between finding a data point and using a fixed string.
- **Process**: If a path *cannot* be resolved in any data source (Input or Global Context), the system treats it as a literal.
- **Behavior**:
    - For the **Field** (left side of condition): If the path isn't found, it returns `false` (skipping condition).
    - For the **Value** (right side of condition): If the path isn't found, it treats the string as a **Literal Constant**.
- **Result**: `equals | patient_type | VIP` will check if the data at `patient_type` is literally the string `"VIP"`.

## 5. Condition Evaluation: Operators
Once values are resolved, [evaluateCondition](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/lib/EvaluateConditions.js) executes the check:
- **Operators**: Handled by the `OPERATORS` map in [Operators.js](file:///c:/Users/bilal/OneDrive/Desktop/JSONTransformerBE/src/utils/Operators.js).
- **Case Sensitivity**: If `case_sensitive` is true, values are compared exactly. Otherwise, they are normalized to lowercase strings.
- **Unary Operators**: Checks like `is_empty` or `is_null` only look at the resolved field value.

## 6. Outcome Processing
If all conditions in a clause are met, an `outcome` object is returned to the handler.
- **`value`**: The primary result for the field. If set to `"skip"`, the field is ignored.
- **`notes`**: Additional metadata added to a global notes array in the transformation response.
- **`isKilled`**: If true, the entire transformation stops immediately, and a "kill status" is returned.
- **`matrixAssignments`**: A set of additional key-value pairs to be added to the final JSON alongside the primary field.
