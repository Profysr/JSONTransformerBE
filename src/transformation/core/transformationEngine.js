import logger from "../../shared/logger.js";
import { processMetrics } from "../handlers/metrics.handler.js";
import { processGeneralRules } from "../handlers/general.processor.js";
import { ErrorHandler } from "../../api/middleware/errorHandler.js";
import { sectionKeys } from "../utils/transformationUtils.js";
import { TransformationContext } from "./TransformationContext.js";
import { processExceptionRules } from "../handlers/exceptional.handler.js";
import { processReadCodes } from "../handlers/read codes handler/readCodes.handler.js";

// ==================
// Transformation Engine
// ==================
export const transformationEngine = (inputData, configRules) => {

  const functionName = "transformationEngine";

  logger.info(
    `Starting transformation process. Identified ${Object.keys(configRules).length} configuration sections to process.`,
    { functionName }
  );

  const context = new TransformationContext(inputData);

  // ==================
  // Section Processing
  // ==================
  for (const [sectionKey, sectionRules] of Object.entries(configRules)) {
    if (context.killResult) break;

    if (!sectionRules || typeof sectionRules !== "object") {
      throw new ErrorHandler(
        400,
        "Configuration is invalid or missing.",
        { sectionKey, functionName }
      );
    }

    try {
      switch (sectionKey) {
        case "metrics_config_rules":
          processMetrics(inputData, sectionRules, context, sectionKey);
          break;
        case "e2e_config_json":
          processReadCodes(inputData, sectionRules, context, sectionKey);
          break;
        case "exception_json":
          processExceptionRules(inputData, sectionRules, context, sectionKey);
          break;
        default:
          if (sectionKeys.includes(sectionKey)) {
            processGeneralRules(inputData, sectionRules, context, sectionKey);
          } else {
            logger.warn(
              "Unknown section type/key. Skipping to prevent data leakage.",
              { sectionKey, functionName }
            );
            throw new ErrorHandler(
              400,
              "Invalid Configuration. Section is not recognized.",
              { sectionKey, functionName }
            );
          }
      }
    } catch (err) {
      logger.error(
        `Failed with error: ${err.message}`,
        { sectionKey, functionName, err }
      );
      throw err;
    }

    if (context.killResult) {
      logger.warn("Transformation aborted by kill signal.", { sectionKey, functionName });
      break;
    }
  }

  // ==================
  // Final Output Resolution
  // ==================
  const candidates = context._viewCandidates?.(true) ?? [];
  logger.debug("Candidates:", { candidates });

  return context.getFinalOutput();
};
