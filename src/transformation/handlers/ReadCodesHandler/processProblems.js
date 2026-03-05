import logger from "../../../shared/logger.js";
import { buildReadCodeObj, buildCreateProblemObj } from "./codeTemplates.js";
import { preprocessProblemsCsv } from "./preprocessProblems.js";

// ============================
// 1. Find Code without laterality in Existings
// ============================
const findRowIdxWithoutLaterality = (
  matchingRows,
  childCode,
  logMeta,
  features = {},
) => {
  logger.info(
    `Looking for childCode: (${childCode}) without laterality`,
    logMeta,
  );
  logger.info(
    `Total matches for code: ${matchingRows.length} in Problem Links Table`,
    logMeta,
  );

  if (matchingRows.length === 0) return null;

  let preferred = null;

  // 1. Prioritize 'Active' status with no meaningful laterality comment
  preferred = matchingRows.find(
    (r) =>
      (r.Status || "").toLowerCase() === "active" &&
      r.notesHasLateral === "null",
  );
  if (preferred) {
    logger.info("Match Found: Active code with no laterality", logMeta);
    return preferred.rowIdx;
  }

  // 2. If no match, check for 'Inactive' status with no meaningful laterality comment (if use_inactive)
  if (features.use_inactive) {
    preferred = matchingRows.find(
      (r) =>
        (r.Status || "").toLowerCase() === "inactive" &&
        r.notesHasLateral === "null",
    );
    if (preferred) {
      logger.info("Match Found: Inactive code with no laterality", logMeta);
      return preferred.rowIdx;
    }
  }

  // 3. If no match, check for 'Active' status with a meaningful laterality comment (as a fallback)
  preferred = matchingRows.find(
    (r) =>
      (r.Status || "").toLowerCase() === "active" &&
      r.notesHasLateral !== "null",
  );
  if (preferred) {
    logger.info("Match Found: Active code with laterality", logMeta);
    return preferred.rowIdx;
  }

  // 4. Final fallback: Select the first row (if active or if use_inactive)
  if (features.use_inactive) {
    preferred = matchingRows[0];
    logger.info("Match Found: Fallback to first match", logMeta);
    return preferred.rowIdx;
  } else {
    preferred = matchingRows.find(
      (r) => (r.Status || "").toLowerCase() === "active",
    );
    if (preferred) {
      logger.info("Match Found: Fallback to first active match", logMeta);
      return preferred.rowIdx;
    }
  }

  return null;
};

// =================================
// 2. Find Code with laterality in Existings
// =================================
const findRowIdxWithLaterality = (
  matchingRows,
  childCode,
  lateral,
  logMeta,
  features = {},
) => {
  logger.info(
    `Looking for code: (${childCode}) with laterality (${lateral}) in Problem List`,
    logMeta,
  );
  logger.info(`UseInActiveCode setting: ${features.use_inactive}`, logMeta);
  logger.info(
    `OverrideBilateral setting: ${features.override_bilateral}`,
    logMeta,
  );

  if (matchingRows.length === 0) return null;

  const lat = (lateral || "").toLowerCase();
  const canUseBilateral =
    features.override_bilateral && (lat === "left" || lat === "right");

  // 1. Look for ACTIVE with EXACT lateral match
  let preferred = matchingRows.find(
    (r) =>
      (r.Status || "").toLowerCase() === "active" &&
      (r.notesHasLateral || "").toLowerCase() === lat,
  );
  if (preferred) {
    logger.info(
      "Match Found (Preference 1): Active code with EXACT laterality.",
      logMeta,
    );
    return preferred.rowIdx;
  }

  // 2. Look for ACTIVE with BILATERAL match (if canUseBilateral)
  if (canUseBilateral) {
    preferred = matchingRows.find(
      (r) =>
        (r.Status || "").toLowerCase() === "active" &&
        (r.notesHasLateral || "").toLowerCase() === "bilateral",
    );
    if (preferred) {
      logger.info(
        "Match Found (Preference 2): Active code with BILATERAL match.",
        logMeta,
      );
      return preferred.rowIdx;
    }
  }

  // 3. Look for INACTIVE with EXACT lateral match (if use_inactive)
  if (features.use_inactive) {
    preferred = matchingRows.find(
      (r) =>
        (r.Status || "").toLowerCase() === "inactive" &&
        (r.notesHasLateral || "").toLowerCase() === lat,
    );
    if (preferred) {
      logger.info(
        "Match Found (Preference 3): Inactive code with EXACT laterality.",
        logMeta,
      );
      return preferred.rowIdx;
    }
  }

  // 4. Look for INACTIVE with BILATERAL match (if use_inactive and canUseBilateral)
  if (features.use_inactive && canUseBilateral) {
    preferred = matchingRows.find(
      (r) =>
        (r.Status || "").toLowerCase() === "inactive" &&
        (r.notesHasLateral || "").toLowerCase() === "bilateral",
    );
    if (preferred) {
      logger.info(
        "Match Found (Preference 4): Inactive code with BILATERAL match.",
        logMeta,
      );
      return preferred.rowIdx;
    }
  }

  logger.info("No suitable code found based on preferences/settings.", logMeta);
  return null;
};

// ============================
// Process Problem Links
// ============================
export const processProblemAttachments = (
  results,
  pendingProblemAttachments,
  problemsCsv,
  rules,
  context,
  sectionKey = "",
  features = {},
  NoProblemCSVFound,
) => {
  logger.info("FULL CONTEXT OBJECT RECEIVED", {
    context,
    contextKeys: Object.keys(context || {}),
  });

  const logMeta = { sectionKey, functionName: "processProblemAttachments" };
  logger.info("problemsCsv received", { ...logMeta, problemsCsv });

  // ================================
  // FORCE FALLBACK MODE ✅
  // ================================
  if (NoProblemCSVFound == true || NoProblemCSVFound == "true") {
    logger.info(
      "NoProblemCSVFound flag detected. Skipping CSV matching.",
      logMeta,
    );

    results.download_problems_csv = false;

    pendingProblemAttachments.forEach(
      ({ childCode, codeData, allowProblemCreation, allowReadCodeSpecial }) => {
        if (allowReadCodeSpecial) {
          results.readCodes.push(
            buildReadCodeObj(codeData, rules, context, sectionKey, childCode),
          );
        } else if (allowProblemCreation) {
          results.createProblems.push(
            buildCreateProblemObj(
              codeData,
              rules,
              context,
              sectionKey,
              childCode,
            ),
          );
        }
      },
    );

    return;
  }

  // ================================
  // Type guard for problemsCsv (should be array or object, not string/null/number)
  // ================================
  if (
    problemsCsv &&
    !Array.isArray(problemsCsv) &&
    typeof problemsCsv === "object"
  ) {
    problemsCsv = Object.keys(problemsCsv).length === 0 ? [] : [problemsCsv];
  }

  // ================================
  // CSV MISSING OR EMPTY
  // ================================
  if (!problemsCsv || problemsCsv.length === 0) {
    logger.info("CSV empty or missing", {
      ...logMeta,
    });

    const needsCsv =
      pendingProblemAttachments.length > 0 ||
      features.link_diabetic_problem == true || features.link_diabetic_problem == "true";

    const isPendingResolutionMode =
      context?.contextInput?.is_pending_resolution === true || context?.contextInput?.is_pending_resolution === "true";

    // First pass => request CSV
    if (needsCsv && isPendingResolutionMode) {
      results.download_problems_csv = true;

      results.pendingCodes = pendingProblemAttachments.map((p) => ({
        childCode: p.childCode,
        codeData: p.codeData,
        allowProblemCreation: p.allowProblemCreation,
        allowReadCodeSpecial: p.allowReadCodeSpecial,
      }));

      logger.info("Problem CSV missing. Requesting CSV.", logMeta);
    }

    return;
  }

  // ================================
  // PREPROCESS CSV
  // ================================
  const preprocessedCsv = preprocessProblemsCsv(problemsCsv, rules);

  logger.info("=== CONTEXT DEBUG START ===", {
    fullContext: context,
    letterTypeNormalized: context?.letter_type?.trim?.().toLowerCase?.(),
    featureFlag: features?.link_diabetic_problem,
  });

  // ============================
  // Special Feature: Link Diabetic Problems
  // ============================
  if (
    features.link_diabetic_problem === true &&
    (context?.contextInput?.letter_type || "").toLowerCase() === "retinal screening"
  ) {
    // logger.info("Letter type in context:", context?.letter_type);

    logger.info("Diabetic block check:", {
      linkFlag: features.link_diabetic_problem,
      letterType: context?.contextInput?.letter_type,
    });

    const logMetaSpecial = {
      ...logMeta,
      specialFeature: "LinkDiabeticProblems",
    };

    const diabeticPriorityCodes = ["X40J5", "X40J4", "C10.."];

    for (const code of diabeticPriorityCodes) {
      const match = preprocessedCsv.find((p) => p.child === code);

      if (match) {
        logger.info(
          `Diabetic match found for ${code} at row ${match.rowIdx}`,
          logMetaSpecial,
        );

        results.attachProblems.push(match.rowIdx);
        return; // STOP everything
      }
    }

    logger.info(
      "No diabetic problems found in CSV. Skipping creation and attachment.",
      logMetaSpecial,
    );
  }

  // ================================
  // NORMAL MATCHING
  // ================================
  pendingProblemAttachments.forEach(
    ({ childCode, codeData, allowProblemCreation, allowReadCodeSpecial }) => {
      const rowLogMeta = { ...logMeta, fieldKey: childCode };

      // Initial filter by code using the preprocessed data
      const potentialMatches = preprocessedCsv.filter(
        (p) =>
          p.code === childCode ||
          p.readCode === childCode ||
          p.child === childCode,
      );

      let matchedRowIdx = null;

      const comments = (codeData.comments || "").trim();
      const term = (codeData.c_term || "").toLowerCase();
      const containsBilateral = term.includes("bilateral");

      // Scenario 1: code[comments] = null or empty, code[term] contains Bilateral
      if (!comments || containsBilateral) {
        matchedRowIdx = findRowIdxWithoutLaterality(
          potentialMatches,
          childCode,
          rowLogMeta,
          features,
        );
      } else {
        // Scenario 2: code[comments] != null
        matchedRowIdx = findRowIdxWithLaterality(
          potentialMatches,
          childCode,
          comments,
          rowLogMeta,
          features,
        );
      }

      if (matchedRowIdx !== null && matchedRowIdx !== undefined) {
        results.attachProblems.push(matchedRowIdx);
        return;
      }

      // Fallback to creation or special read behavior
      if (allowReadCodeSpecial) {
        results.readCodes.push(
          buildReadCodeObj(codeData, rules, context, sectionKey, childCode),
        );
      } else if (allowProblemCreation) {
        results.createProblems.push(
          buildCreateProblemObj(
            codeData,
            rules,
            context,
            sectionKey,
            childCode,
          ),
        );
      }
    },
  );
};
