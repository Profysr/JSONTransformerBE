import { getAccessToken } from "../auth/index.js";
import { SERVERS } from "../global/Constants.js";
import { deriveJSONRules } from "../lib/deriveJSON.js";
import logger from "../lib/logger.js";
import { makeRequestWithRetry } from "../lib/makeReq.js";
import catchAsyncHandler from "../middleware/catchAsyncHandler.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { transformerHelper } from "../transformation/transformerHelper.js";

/** Fetching configuration rules here */
export const fetchConfigRules = async (inst_id, letter_type) => {
  /** Defining endpoint dynamically */
  let BASE_URL = SERVERS["shary_prod"].BASE_URL;
  let endpointUrl = `${BASE_URL}/automation_config/letter_type_config_filter/${inst_id}/`;
  let payload = {
    letter_type: letter_type,
  };

  try {
    const result = await makeRequestWithRetry(
      () => getAccessToken("shary_prod"),
      endpointUrl,
      "POST",
      payload,
      {
        maxAttempts: 3,
        retryDelay: 3000,
        logPrefix: `Fetching Config Rules for ${inst_id} and ${letter_type}`
      }
    );

    logger.info(
      `Configuration rules for ${inst_id} - ${letter_type} found.`
    );

    /** Extracting data and passing it to next function to normalize */
    let backendConfig = result.data[0]?.config_rules.config;
    let configRules = deriveJSONRules(backendConfig);

    return configRules;
  } catch (error) {
    logger.error(`Failed to fetch config rules: ${error.message}`);
    throw error;
  }
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

      /** pass the inputData and rules to transformData function */
      const output = transformerHelper(inputData, configRules);

      /** if kill property found, then storing it with output */
      if (output && output.isKilled === true) {
        logger.warn("Transformation terminated. ", {
          output
        });

        return res.status(200).json({
          success: false,
          message: `Transformation terminated by rule applied to ${output.field} for value ${output.value}. The resulting value is retained.`,
          KillResponse: {
            ...output
          },
        });
      }

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
          `Transformation failed: ${error.message || "An internal error prevented the data transformation."}`
        )
      );
    } finally {
      await logger.sendLogs(apiEndpoint, letter_type, nhs_id, letter_id);
    }
  }
);
