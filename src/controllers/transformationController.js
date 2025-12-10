import { CONFIG } from "../lib/ConfigRULES.js";
import { transformData } from "../services/mapperService.js";

export const processTransformation = ({ inst_id, letter_type, inputData }) => {
  // --- 1. Input Validation ---
  if (
    !inputData ||
    typeof inputData !== "object" ||
    Object.keys(inputData).length === 0
  ) {
    console.warn("Transformation rejected: Invalid or empty input data.");
    return {
      status: "error",
      ok: false,
      message:
        "Invalid or empty input data provided. Please provide a valid JSON object.",
      output: {},
    };
  }

  try {
    /** find configuration rules for the instance and letter type */
    const configRules = CONFIG.filter((config) => {
      return (
        config.client_id === inst_id && config.letter_type_from === letter_type
      );
    });

    if (configRules.length === 0) {
      return {
        status: "error",
        ok: false,
        message: `No configuration rules found for inst_id: ${inst_id} and letter_type: ${letter_type}`,
        output: {},
      };
    }

    /** pass the inputData and rules to transformData function */
    const output = transformData(inputData, configRules[0]);

    /** if kill property found, then storing it with output */
    if (output && output.isKilled === true) {
      output.data["killStatus"] = {
        isKilled: output.isKilled,
        sourceField: output.sourceField,
      };

      return {
        status: "killed",
        ok: false,
        message: `Transformation terminated by rule applied to ${output.sourceField}. The resulting value is retained.`,
        output: output.data,
      };
    }

    return {
      status: "success",
      ok: true,
      message:
        "Data successfully transformed according to client-specific rules.",
      output: output,
    };
  } catch (error) {
    console.error("Transformation Execution Error:", error);
    return {
      status: "error",
      ok: false,
      message: "An internal error prevented the data transformation.",
      error: error.message,
    };
  }
};
