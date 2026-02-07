import logger from "../../shared/logger.js";
import { processMetrics } from "../handlers/metrics.handler.js";
import { processReadCodes } from "../handlers/readCodes.handler.js";
import { processGeneralRules } from "../handlers/general.processor.js";
import { ErrorHandler } from "../../api/middleware/errorHandler.js";
import { sectionKeys } from "../utils/transformationUtils.js";
import { TransformationContext } from "./TransformationContext.js";
import { processExceptionRules } from "../handlers/exceptional.handler.js";

// ==================
// Transformation Engine
// ==================
export const transformationEngine = (inputData, configRules) => {
  const startTime = Date.now();
  logger.info(
    `Starting transformation process. Identified ${Object.keys(configRules).length} configuration sections to process.`,
  );

  const context = new TransformationContext(inputData);

  // ==================
  // Section Processing
  // ==================
  for (const [sectionKey, sectionRules] of Object.entries(configRules)) {
    if (context.killResult) break;

    logger.info(`[Section: ${sectionKey}] Beginning evaluation...`);

    if (!sectionRules || typeof sectionRules !== "object") {
      throw new ErrorHandler(
        400,
        `[Section: ${sectionKey}] Configuration is invalid or missing.`,
      );
    }

    const sectionType = sectionRules.sectionKey ?? sectionKey;
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
            processGeneralRules(inputData, sectionRules, context);
          } else {
            logger.warn(
              `[Section: ${sectionKey}] Unknown section type/key. Skipping to prevent data leakage.`,
            );
            throw new ErrorHandler(
              400,
              `[Section: ${sectionKey}] Invalid Configuration. Section is not recognized.`,
            );
          }
      }
    } catch (err) {
      logger.error(
        `[Section: ${sectionKey}] Failed with error: ${err.message}`,
      );
      throw err;
    }

    const sectionDuration = Date.now() - sectionStart;
    logger.info(`[Section: ${sectionKey}] Completed in ${sectionDuration}ms.`);

    if (context.killResult) {
      logger.warn("Transformation aborted by kill signal.");
      break;
    }
  }

  // ==================
  // Final Output Resolution
  // ==================
  const finalOutput = context.getFinalOutput();
  const candidates = context.viewCandidates?.(true) ?? []; // ✅ safer than calling private _viewCandidates
  const totalDuration = Date.now() - startTime;

  logger.info(
    `Transformation lifecycle finished successfully in ${totalDuration}ms.`,
  );
  logger.debug("Candidates (debug only):", candidates);

  return finalOutput;
};
