import { getAccessToken } from "../auth/index.js";
import { SERVERS } from "../global/Constants.js";
import { deriveJSONRules } from "../lib/deriveJSON.js";
import logger from "../lib/logger.js";
import { makeRequest } from "../lib/makeReq.js";
import catchAsyncHandler from "../middleware/catchAsyncHandler.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { transformerHelper } from "../transformation/transformerHelper.js";

/** Fetching configuration rules here */
export const fetchConfigRules = async (inst_id, letter_type) => {
  let success = false;
  let lastError = null;
  let MAX_ATTEMPTS = 3;
  let configRules = null; // FIX: Added missing declaration

  /** Defining logs endpoint dynamically */
  let BASE_URL = SERVERS["shary_prod"].BASE_URL;
  let endpointUrl = `${BASE_URL}/automation_config/letter_type_config_filter/${inst_id}/`;
  let payload = {
    letter_type: letter_type,
  };

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
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
        logger.warn(
          `Attempt ${i} failed (${lastError.message}). Retrying in 3 second...`
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (error) {
      lastError = error;
      logger.error(`Attempt ${i} error:`, { error: error.message });
      if (i < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  if (!success) {
    logger.error(`Failed to fetch config rules after ${MAX_ATTEMPTS} attempts`);
    throw lastError || new Error("Failed to fetch configuration rules");
  }

  return configRules;
};

/** function starts here */
export const processTransformation = catchAsyncHandler(
  async (req, res, next) => {
    const { inst_id } = req.params;
    const inputData = req.body || {};

    /** Extract context for logging */
    let nhs_id = inputData?.nhs_id;
    let letter_id = inputData?.letter_id;
    let letter_type = inputData?.letter_type;

    /** Defining logs endpoint dynamically */
    let BASE_URL = SERVERS["shary_prod"].BASE_URL;
    let apiEndpoint = `${BASE_URL}/automation_config/transformation_logs/${inst_id
      .toLowerCase()
      .trim()}`;

    logger.info("Received transformation request with parameters:", {
      inst_id,
      letter_type,
      nhsid: nhs_id,
      letter_id,
    });

    try {
      /** send the input data and slug to the transformation */
      // --- 1. Input Validation ---
      if (
        !inputData ||
        typeof inputData !== "object" ||
        Object.keys(inputData).length === 0
      ) {
        logger.error("Input Validation failed", JSON.stringify(inputData));
        return next(
          new ErrorHandler(
            400,
            "Invalid or empty input data provided. Please provide a valid JSON object."
          )
        );
      }

      /** find configuration rules for the instance and letter type */
      logger.info(
        `Searching for configuration rules: inst_id=${inst_id}, letter_type=${letter_type}`
      );

      /** Getting configuration rules from backend */
      let configRules = await fetchConfigRules(inst_id, letter_type);

      if (!configRules || Object.keys(configRules).length === 0) {
        logger.error(`No configuration rules found`);
        return next(
          new ErrorHandler(
            404,
            `No configuration rules found for inst_id: ${inst_id} and letter_type: ${letter_type}`
          )
        );
      }

      logger.info("Configuration rules loaded successfully");

      /** pass the inputData and rules to transformData function */
      const output = transformerHelper(inputData, configRules);

      /** if kill property found, then storing it with output */
      if (output && output.isKilled === true) {
        logger.warn("Transformation terminated by kill rule", {
          field: output.field,
          value: output.value,
          sectionKey: output.sectionKey,
        });

        return res.status(401).json({
          success: false,
          message: `Transformation terminated by rule applied to ${output.field} for value ${output.value}. The resulting value is retained.`,
          output: output.data,
          killInfo: {
            field: output.field,
            value: output.value,
            sectionKey: output.sectionKey,
          },
        });
      }

      logger.info("Transformation completed successfully");

      return res.status(200).json({
        success: true,
        message:
          "Data successfully transformed according to client-specific rules.",
        output,
      });
    } catch (error) {
      logger.error("Transformation Execution Error:", {
        error: error.message,
        stack: error.stack,
      });
      return next(
        new ErrorHandler(
          500,
          "An internal error prevented the data transformation."
        )
      );
    } finally {
      // Invoke logger.sendLogs after processing is complete
      // await logger.sendLogs(apiEndpoint, letter_type, nhs_id, letter_id);
    }
  }
);
