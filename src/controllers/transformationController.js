import { getAccessToken } from "../auth/index.js";
import { SERVERS } from "../global/Constants.js";
import { deriveJSONRules } from "../lib/deriveJSON.js";
import logger from "../lib/logger.js";
import { makeRequest } from "../lib/makeReq.js";
import { transformData } from "../services/mapperService.js";

export const processTransformation = async ({
  inst_id,
  letter_type,
  inputData,
}) => {
  // --- 1. Input Validation ---
  if (
    !inputData ||
    typeof inputData !== "object" ||
    Object.keys(inputData).length === 0
  ) {
    logger.error("Input Validaion failed", JSON.stringify(inputData));
    return {
      status: "error",
      ok: false,
      message:
        "Invalid or empty input data provided. Please provide a valid JSON object.",
      output: {},
    };
  }

  logger.info("Input validation passed");
  try {
    /** find configuration rules for the instance and letter type */
    logger.info(
      `Searching for configuration rules: inst_id=${inst_id}, letter_type=${letter_type}`
    );

    /** Getting configuration rules from backend */
    let configRules = [];
    let success = false;
    let lastError = null;
    let MAX_ATTEMPTS = 3;

    /** Defining logs endpoint dynamically */
    let BASE_URL = SERVERS["shary_prod"].BASE_URL;
    let endpointUrl = `${BASE_URL}/automation_config/letter_type_config_filter/${inst_id}/`;
    let payload = {
      letter_type: letter_type,
    };

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const accessToken = await getAccessToken("shary_prod");

      const result = await makeRequest(
        endpointUrl,
        accessToken,
        "POST",
        payload
      );

      if (result.success) {
        logger.info(
          `Configuration rules for ${inst_id} - ${letter_type} found.`
        );

        let backendConfig = result.data[0]?.config_rules.config;
        configRules = deriveJSONRules(backendConfig);
        success = true;
        break;
      }

      lastError = new Error(result.error || "Unknown error");

      // Log the failed attempt, but only retry if we haven't hit the max attempts
      if (!success && i < MAX_ATTEMPTS) {
        console.warn(
          `Attempt ${i} failed (${lastError.message}). Retrying in 3 second...`
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    if (configRules.length === 0) {
      logger.error(`No configuration rules found`);
      return {
        status: "error",
        ok: false,
        message: `No configuration rules found for inst_id: ${inst_id} and letter_type: ${letter_type}`,
        output: {},
      };
    }

    /** pass the inputData and rules to transformData function */
    const output = transformData(inputData, configRules);

    /** if kill property found, then storing it with output */
    if (output && output.isKilled === true) {
      // output.data["kill_automation"] = {
      //   isKilled: output.isKilled,
      //   field: fieldKey,
      //   fieldValue: derivedValue.value,
      // };

      return {
        status: "killed",
        ok: false,
        message: `Transformation terminated by rule applied to ${output.field} for value ${output.fieldValue}. The resulting value is retained.`,
        output
        // output: output.data,
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
    logger.error("Transformation Execution Error:", error);
    return {
      status: "error",
      ok: false,
      message: "An internal error prevented the data transformation.",
      error: error.message,
    };
  }
};
