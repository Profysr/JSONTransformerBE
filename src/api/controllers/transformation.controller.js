import { CONFIG } from "../../config/app.config.js";
import logger from "../../shared/logger.js";
import { makeRequestWithRetry } from "../../shared/providers/requestClient.js";
import catchAsyncHandler from "../middleware/catchAsyncHandler.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { getAccessToken } from "../../shared/providers/auth.service.js";
import { deriveJSONRules } from "../../core/transformation/engineFunctions/rulesDeriver.js";
import { transformationEngine } from "../../core/transformationEngine.js";

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
      `Successfully retrieved configuration rules for '${inst_id}' [${letter_type}].`
    );

    /** Extracting data and passing it to next function to normalize */
    let backendConfig = result.data[0];
    let configRules = deriveJSONRules(backendConfig);

    return configRules;
  } catch (error) {
    logger.warn(`Failed to fetch config rules: ${error.message}`);
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

/**
 * Orchestrates the core transformation logic
 */
const orchestrateTransformation = (inputData, configRules) => {
  return transformationEngine(inputData, configRules);
};

// ==================
// 3 Response Formatting
// ==================

const formatTransformationResponse = (res, output) => {
  /** if kill property found, then storing it with output */
  if (output && output.isKilled === true) {
    logger.warn("Transformation terminated. ", { output });

    return res.status(200).json({
      success: false,
      message: `Transformation terminated by rule applied to ${output.field} for value ${output.value}. The resulting value is retained.`,
      isKilled: true,
      output,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Data successfully transformed according to client-specific rules.",
    isKilled: false,
    output,
  });
};

// ==================
// 4 Main Transformation Handler
// ==================
export const processTransformation = catchAsyncHandler(
  async (req, res, next) => {
    const { inst_id } = req.params;
    const inputData = req.body || {};

    const nhs_id = inputData?.nhs_id;
    const letter_id = inputData?.letter_id;
    const letter_type = inputData?.letter_type;

    const BASE_URL = CONFIG.shary.apiUrl;
    const apiEndpoint = `${BASE_URL}/automation_config/transformation_logs/${inst_id.toLowerCase().trim()}`;

    logger.info("Incoming transformation request received.", {
      inst_id,
      letter_type,
      nhsid: nhs_id,
      letter_id,
    });

    try {
      const validationError = validateTransformationInput(inputData);
      if (validationError) return next(validationError);

      logger.info(`Fetching automation rules for institution '${inst_id}' and letter type '${letter_type}'...`);
      const configRules = await fetchConfigRules(inst_id, letter_type);

      if (!configRules || Object.keys(configRules).length === 0) {
        logger.error(`No configuration rules found`);
        return next(new ErrorHandler(404, `No configuration rules found for inst_id: ${inst_id} and letter_type: ${letter_type}`));
      }

      const output = orchestrateTransformation(inputData, configRules);

      if (output instanceof ErrorHandler) {
        return next(output);
      }

      return formatTransformationResponse(res, output);
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

// ==================
// 5 Problem Resolution Logic
// ==================
/**
 * Filters rules to only keep the Read Codes (e2e_config_json) section
 */
const filterRulesForProblemResolution = (configRules) => {
  let readCodesSection = configRules.e2e_config_json;

  // Fallback search by sectionKey if not valid
  if (!readCodesSection) {
    readCodesSection = Object.values(configRules).find(r => r && r.sectionKey === "e2e_config_json");
  }

  if (!readCodesSection) return null;

  return { e2e_config_json: readCodesSection };
};

/**
 * Executes the problem resolution transformation
 */
const executeProblemResolution = (inputData, filteredRules) => {
  return transformationEngine(inputData, filteredRules);
};

// ==================
// 6 Problem Resolution Handler
// ==================
/**
 * Specialized endpoint for Read Codes Problem Resolution (Part 2)
 * Only processes the e2e_config_json section with problems_csv
 */
export const processProblemResolution = catchAsyncHandler(
  async (req, res, next) => {
    const { inst_id } = req.params;
    const inputData = req.body || {};

    const nhs_id = inputData?.nhs_id;
    const letter_id = inputData?.letter_id;
    const letter_type = inputData?.letter_type;

    logger.info("Received Problem Resolution request:", {
      inst_id,
      letter_type,
      nhsid: nhs_id,
      letter_id,
      hasCsv: !!(inputData.problems_csv && inputData.problems_csv.length)
    });

    try {
      if (!inputData || typeof inputData !== "object") {
        return next(new ErrorHandler(400, "Invalid input data."));
      }

      const configRules = await fetchConfigRules(inst_id, letter_type);
      if (!configRules || Object.keys(configRules).length === 0) {
        return next(new ErrorHandler(404, `No configuration rules found for inst_id: ${inst_id}`));
      }

      const filteredRules = filterRulesForProblemResolution(configRules);
      if (!filteredRules) {
        return next(new ErrorHandler(404, "Read Codes configuration (e2e_config_json) not found in rules."));
      }

      logger.info(`[ProblemResolution] Filtered rules to only process e2e_config_json.`);
      const output = executeProblemResolution(inputData, filteredRules);

      if (output instanceof ErrorHandler) {
        return next(output);
      }

      return res.status(200).json({
        success: true,
        message: "Read Codes Problem Resolution completed.",
        output,
      });
    } catch (error) {
      logger.error("Problem Resolution Error:", { error: error.message, stack: error.stack });
      return next(new ErrorHandler(500, `Problem Resolution failed: ${error.message}`));
    }
  }
);
