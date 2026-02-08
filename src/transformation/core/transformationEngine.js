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
  const startTime = Date.now();
  const sectionKey = "general";
  const functionName = "transformationEngine";

  logger.info(
    `Starting transformation process. Identified ${Object.keys(configRules).length} configuration sections to process.`,
    { sectionKey, functionName }
  );

  const context = new TransformationContext(inputData);

  // ==================
  // Section Processing
  // ==================
  for (const [sectionKeyEntry, sectionRules] of Object.entries(configRules)) {
    if (context.killResult) break;

    const sectionType = sectionRules.sectionKey ?? sectionKeyEntry;
    const currentSectionKey = sectionType; // Use the specific section type as the key

    logger.info("Beginning evaluation...", { sectionKey: currentSectionKey, functionName });

    if (!sectionRules || typeof sectionRules !== "object") {
      throw new ErrorHandler(
        400,
        "Configuration is invalid or missing.",
        { sectionKey: currentSectionKey, functionName }
      );
    }

    const sectionStart = Date.now();

    try {
      switch (sectionType) {
        case "metrics_config_rules":
          processMetrics(inputData, sectionRules, context);
          break;
        case "e2e_config_json":
          processReadCodes(inputData, sectionRules, context);
          break;
        case "exception_json":
          processExceptionRules(inputData, sectionRules, context);
          break;
        default:
          if (sectionKeys.includes(sectionType)) {
            processGeneralRules(inputData, sectionRules, context, sectionType);
          } else {
            logger.warn(
              "Unknown section type/key. Skipping to prevent data leakage.",
              { sectionKey: currentSectionKey, functionName }
            );
            throw new ErrorHandler(
              400,
              "Invalid Configuration. Section is not recognized.",
              { sectionKey: currentSectionKey, functionName }
            );
          }
      }
    } catch (err) {
      logger.error(
        `Failed with error: ${err.message}`,
        { sectionKey: currentSectionKey, functionName, err }
      );
      throw err;
    }

    const sectionDuration = Date.now() - sectionStart;
    logger.info(`Completed in ${sectionDuration}ms.`, { sectionKey: currentSectionKey, functionName });

    if (context.killResult) {
      logger.warn("Transformation aborted by kill signal.", { sectionKey: currentSectionKey, functionName });
      break;
    }
  }

  // ==================
  // Final Output Resolution
  // ==================
  const finalOutput = context.getFinalOutput();
  const candidates = context._viewCandidates?.(true) ?? [];
  const totalDuration = Date.now() - startTime;

  logger.info(
    `Transformation lifecycle finished successfully in ${totalDuration}ms.`,
    { sectionKey, functionName }
  );
  logger.debug("Candidates:", { candidates, sectionKey, functionName });

  return finalOutput;
};
