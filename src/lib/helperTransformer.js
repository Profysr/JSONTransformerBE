

export function transformData(inputData, config) {
  const output = { ...inputData };
  /**
   * Using hard coded mappings here for now. In real app, you would fetch the mapping rules
   * based on client_id and letter_type from a database or config service.
   */
  const mappings = [...config.default_config] || [];

  for (const rule of mappings) {
    let { target_field: targetField, type } = rule;
    let outputValue;

    try {
      switch (type) {
        case "field_reference":
          // Type 1: Simple copy from a source field in the input
          const sourceField = rule.field;
          outputValue = inputData[sourceField];

          if (outputValue === undefined) {
            throw new Error(
              `Source field is '${sourceField}' missing in input JSON. How can we map it to '${targetField}'?`
            );
          }

        case "static_value":
          // Type 2: Assign a hardcoded static value defined in the rule
          outputValue = rule.value;
          break;

        case "conditional":
          // 1. Evaluate all conditions and store boolean results
          const results = rule.conditions.map((cdn) =>
            evaluateCondition(inputData, cdn)
          );

          let finalResult;
          if (rule.logic_type === "AND") {
            // If AND, ALL results must be true
            finalResult = results.every((res) => res === true);
          } else if (rule.logic_type === "OR") {
            // If OR, ANY result must be true
            finalResult = results.some((res) => res === true);
          } else {
            // Handle unknown logic type
            // console.error(
            //   `[ERROR] Invalid logic_type: ${rule.logic_type}. Defaulting to AND.`
            // );
            throw new Error(
              `Invalid logic_type: ${rule.logic_type} in conditional rule for target field ${targetField}.`
            );
          }

          // 2. Determine output value based on the combined final
          if (finalResult) {
            outputValue = rule.conditional_value;
          } else {
            outputValue = rule.default_value;
          }
          break;

        default:
          // console.error(
          //   `[ERROR] Unknown rule type: ${type} for target field ${targetField}.`
          // );
          throw new Error(
            `Unknown rule type: ${type} for target field ${targetField}.`
          );
      }

      // Assign the calculated value to the output JSON, but only if it's not undefined
      if (outputValue !== undefined) {
        console.log(
          `Setting value for output field '${targetField}':`,
          outputValue
        );

        output[targetField] = outputValue;
      }
    } catch (error) {
      console.error(
        `[ERROR] Failed to process rule for target field ${targetField}:`,
        error.message
      );
      // Optionally, you could skip this field or add an error flag to the output
    }
  }

  return output;
}
