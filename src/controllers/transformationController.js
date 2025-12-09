import { transformData } from "../services/mapperService.js";

export const processTransformation = (inputData) => {
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
    const output = transformData(inputData);

    // We'll check if the resulting 'is_rpa_check_fond' field is the kill signal
    // if (output.is_rpa_check_fond === "<<kill>>") {
    //   return {
    //     status: "killed",
    //     ok: false,
    //     message:
    //       "Transformation terminated: RPA note check triggered a kill signal.",
    //     output: output,
    //   };
    // }

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
