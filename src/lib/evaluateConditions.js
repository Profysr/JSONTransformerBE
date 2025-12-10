/**
 * Executes a single rule condition against the input data.
 */
export function evaluateCondition(inputData, condition) {
  /**
   * sourceValue: The value from the input data based on the condition's field
   */
  const sourceValue = inputData[condition.field];

  if (sourceValue === undefined) {
    console.warn(`Source field ${condition.field} not found in input data.`);
    // throw new Error(`Source field ${condition.field} not found in input data.`);
  }

  // Prepare values for comparison based on case sensitivity flag
  const sourceStr = condition.case_sensitive
    ? String(sourceValue)
    : String(sourceValue).toLowerCase();
  const targetStr = condition.case_sensitive
    ? String(condition.value)
    : String(condition.value).toLowerCase();

  // Evaluate based on the defined operator
  switch (condition.operator) {
    case "contains":
      return sourceStr.includes(targetStr);
    case "not_contains":
      return !sourceStr.includes(targetStr);
    case "equals":
      return sourceStr === targetStr;
    case "not_equals":
      return sourceStr !== targetStr;
    case "starts_with":
      return sourceStr.startsWith(targetStr);
    case "does_not_start_with":
      return !sourceStr.startsWith(targetStr);
    case "empty":
      return sourceStr.length === 0;
    case "not_empty":
      return sourceStr.length > 0;
    default:
      console.warn(
        `[WARNING] Unknown operator: ${condition.operator}. Using 'equals' as default.`
      );
      throw new Error(`Unknown operator: ${condition.operator}`);
  }
}
