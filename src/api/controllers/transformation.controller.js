import { CONFIG } from "../../config/app.config.js";
import logger from "../../shared/logger.js";
import { makeRequestWithRetry } from "../../shared/providers/requestClient.js";
import catchAsyncHandler from "../middleware/catchAsyncHandler.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { getAccessToken } from "../../shared/providers/auth.service.js";
import { deriveJSONRules } from "../../transformation/engineFunctions/rulesDeriver.js";
import { transformationEngine } from "../../transformation/core/transformationEngine.js";
import { TransformationContext } from "../../transformation/core/TransformationContext.js";
import { processReadCodes } from "../../transformation/handlers/ReadCodesHandler/readCodes.handler.js";

// ==================
// 1 Config Rule Fetching
// ==================

export const fetchConfigRules = async (inst_id, letter_type) => {
  /** Defining endpoint dynamically */
  let BASE_URL = CONFIG.shary.apiUrl;
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
      `Successfully retrieved configuration rules for '${inst_id}' [${letter_type}].`,
      { functionName: "fetchConfigRules" }
    );

    /** Extracting data and passing it to next function to normalize */
    let backendConfig = result.data[0];
    let configRules = deriveJSONRules(backendConfig);

    return configRules;
  } catch (error) {
    logger.warn(`Failed to fetch config rules: ${error.message}`, { functionName: "fetchConfigRules" });
    return new ErrorHandler(
      500,
      `Failed to fetch config rules: ${error.message}`
    );
  }
};

// ==================
// 2 Validation & Orchestration Helpers
// ==================

const validateTransformationInput = (inputData) => {
  if (
    !inputData ||
    typeof inputData !== "object" ||
    Object.keys(inputData).length === 0
  ) {
    return new ErrorHandler(
      400,
      "Invalid or empty input data provided. Please provide a valid JSON object."
    );
  }
  return null;
};

// ==================
// 3 Response Formatting
// ==================

const formatTransformationResponse = (res, output, meta) => {
  /** if kill property found, then storing it with output */
  if (output && output.isKilled === true) {
    logger.warn("Transformation terminated.", { output, functionName: "formatTransformationResponse" });

    return res.status(200).json({
      success: false,
      message: `Transformation terminated by rule applied to ${output.field} for value ${output.value}. The resulting value is retained.`,
      isKilled: true,
      ...meta,
      output,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Data successfully transformed according to client-specific rules.",
    isKilled: false,
    ...meta,
    output,
  });
};

// ==================
// 4 Main Transformation Handler
// ==================
export const processTransformation = catchAsyncHandler(
  async (req, res, next) => {
    const startTime = Date.now();
    const { inst_id } = req.params;
    const inputData = req.body || {};

    const nhs_id = inputData?.nhs_id;
    const letter_id = inputData?.letter_id;
    const letter_type = inputData?.letter_type;

    const BASE_URL = CONFIG.shary.apiUrl;
    const apiEndpoint = `${BASE_URL}/automation_config/transformation_logs/${inst_id.toLowerCase().trim()}`;

    let meta = { inst_id, letter_type, nhs_id, letter_id };
    logger.info("Incoming transformation request received.", {
      ...meta
    });

    try {
      const validationError = validateTransformationInput(inputData);
      if (validationError) return next(validationError);

      logger.info(`Fetching automation rules for institution '${inst_id}' and letter type '${letter_type}'...`);
      const configRules = await fetchConfigRules(inst_id, letter_type);

      if (!configRules || Object.keys(configRules).length === 0) {
        logger.error("No configuration rules found", { inst_id, letter_type });
        return next(new ErrorHandler(404, `No configuration rules found for inst_id: ${inst_id} and letter_type: ${letter_type}`));
      }

      const output = transformationEngine(inputData, configRules);

      const duration = Date.now() - startTime;
      logger.info(`Total transformation process completed in ${duration}ms.`);

      if (output instanceof ErrorHandler) {
        return next(output);
      }

      return formatTransformationResponse(res, output, meta);
    } catch (error) {
      logger.error("Transformation Execution Error:", {
        error: error.message,
        stack: error.stack,
        ...meta
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

// ==================
// 5. Specialized endpoint for Read Codes Problem Resolution (Part 2)
// ==================
export const findExistingProblems = catchAsyncHandler(
  async (req, res, next) => {
    const { inst_id } = req.params;
    const inputData = req.body || {};

    const letter_type = inputData?.letter_type;

    logger.info("Received Problem Resolution request:", {
      inst_id,
      letter_type,
      hasCsv: !!(inputData.problems_csv && inputData.problems_csv.length),
    });

    // Signal optimized path for handlers
    inputData.is_pending_resolution = true;

    try {
      if (!inputData || typeof inputData !== "object") {
        return next(new ErrorHandler(400, "Invalid input data."));
      }

      /** if sheroz bhii add section based filtering, we can solely fetched e2e_config from backend directly */
      const configRules = await fetchConfigRules(inst_id, letter_type);
      if (!configRules || Object.keys(configRules).length === 0) {
        return next(new ErrorHandler(404, `No configuration rules found for inst_id: ${inst_id}`));
      }


      const filteredRules = configRules.e2e_config_json;
      if (!filteredRules || Object.keys(filteredRules).length === 0) {
        return next(new ErrorHandler(404, "Read Codes configuration (e2e_config_json) not found in rules."));
      }

      const context = new TransformationContext(inputData);
      processReadCodes(inputData, filteredRules, context, "e2e_config_json");
      const output = context.getFinalOutput();

      if (output instanceof ErrorHandler) {
        return next(output);
      }

      return res.status(200).json({
        success: true,
        message: "Read Codes Problem Resolution completed.",
        output,
      });
    } catch (error) {
      logger.error("Problem Resolution Error:", { error: error.message, stack: error.stack, functionName: "processProblemResolution", inst_id, letter_type });
      return next(new ErrorHandler(500, `Problem Resolution failed: ${error.message}`));
    }
  }
);
