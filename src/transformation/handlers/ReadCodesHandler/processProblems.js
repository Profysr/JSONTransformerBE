import logger from "../../../shared/logger.js";
import { buildReadCodeObj, buildCreateProblemObj } from "./codeTemplates.js";
import { preprocessProblemsCsv } from "./preprocessProblems.js";

// ============================
// 1. Find Code without laterality in Existings
// ============================
const findRowIdxWithoutLaterality = (matchingRows, childCode, logMeta, features = {}) => {
    logger.info(`Looking for childCode: (${childCode}) without laterality`, logMeta);
    logger.info(`Total matches for code: ${matchingRows.length} in Problem Links Table`, logMeta);

    if (matchingRows.length === 0) return null;

    let preferred = null;

    // 1. Prioritize 'Active' status with no meaningful laterality comment
    preferred = matchingRows.find(
        (r) => (r.Status || "").toLowerCase() === "active" && r.notesHasLateral === "null",
    );
    if (preferred) {
        logger.info("Match Found: Active code with no laterality", logMeta);
        return preferred.rowIdx;
    }

    // 2. If no match, check for 'Inactive' status with no meaningful laterality comment (if use_inactive)
    if (features.use_inactive) {
        preferred = matchingRows.find(
            (r) => (r.Status || "").toLowerCase() === "inactive" && r.notesHasLateral === "null",
        );
        if (preferred) {
            logger.info("Match Found: Inactive code with no laterality", logMeta);
            return preferred.rowIdx;
        }
    }

    // 3. If no match, check for 'Active' status with a meaningful laterality comment (as a fallback)
    preferred = matchingRows.find(
        (r) => (r.Status || "").toLowerCase() === "active" && r.notesHasLateral !== "null",
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
        preferred = matchingRows.find((r) => (r.Status || "").toLowerCase() === "active");
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
const findRowIdxWithLaterality = (matchingRows, childCode, lateral, logMeta, features = {}) => {
    logger.info(`Looking for code: (${childCode}) with laterality (${lateral}) in Problem List`, logMeta);
    logger.info(`UseInActiveCode setting: ${features.use_inactive}`, logMeta);
    logger.info(`OverrideBilateral setting: ${features.override_bilateral}`, logMeta);

    if (matchingRows.length === 0) return null;

    const lat = (lateral || "").toLowerCase();
    const canUseBilateral = features.override_bilateral && (lat === "left" || lat === "right");

    // 1. Look for ACTIVE with EXACT lateral match
    let preferred = matchingRows.find(
        (r) => (r.Status || "").toLowerCase() === "active" && (r.notesHasLateral || "").toLowerCase() === lat
    );
    if (preferred) {
        logger.info("Match Found (Preference 1): Active code with EXACT laterality.", logMeta);
        return preferred.rowIdx;
    }

    // 2. Look for ACTIVE with BILATERAL match (if canUseBilateral)
    if (canUseBilateral) {
        preferred = matchingRows.find(
            (r) => (r.Status || "").toLowerCase() === "active" && (r.notesHasLateral || "").toLowerCase() === "bilateral"
        );
        if (preferred) {
            logger.info("Match Found (Preference 2): Active code with BILATERAL match.", logMeta);
            return preferred.rowIdx;
        }
    }

    // 3. Look for INACTIVE with EXACT lateral match (if use_inactive)
    if (features.use_inactive) {
        preferred = matchingRows.find(
            (r) => (r.Status || "").toLowerCase() === "inactive" && (r.notesHasLateral || "").toLowerCase() === lat
        );
        if (preferred) {
            logger.info("Match Found (Preference 3): Inactive code with EXACT laterality.", logMeta);
            return preferred.rowIdx;
        }
    }

    // 4. Look for INACTIVE with BILATERAL match (if use_inactive and canUseBilateral)
    if (features.use_inactive && canUseBilateral) {
        preferred = matchingRows.find(
            (r) => (r.Status || "").toLowerCase() === "inactive" && (r.notesHasLateral || "").toLowerCase() === "bilateral"
        );
        if (preferred) {
            logger.info("Match Found (Preference 4): Inactive code with BILATERAL match.", logMeta);
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
) => {
    // results.readCodes = results.readCodes || [];
    // results.createProblems = results.createProblems || [];
    // results.attachProblems = results.attachProblems || [];
    // results.pendingCodes = results.pendingCodes || [];

    const logMeta = { sectionKey, functionName: "processProblemAttachments" };

    if (pendingProblemAttachments.length === 0) return;

    /**
     * If csv is present, but there's no problem in it. This likely means user has removed all problems from csv after first request. In this case, we should not attempt to match any codes and directly move them to pending resolution again, instead of creating/attaching problems based on stale csv data. This is a critical fix to prevent incorrect problem attachments or creations based on outdated csv inputs.
     */
    if (!problemsCsv) {
        results.download_problems_csv = true;

        // Capture full context for optimized second request
        results.pendingCodes = pendingProblemAttachments.map(p => ({
            childCode: p.childCode,
            codeData: p.codeData,
            allowProblemCreation: p.allowProblemCreation,
            allowReadCodeSpecial: p.allowReadCodeSpecial
        }));

        logger.info(`Problem CSV missing. ${results.pendingCodes.length} codes added to pendingCodes.`, logMeta);
        return;
    }

    // Preprocess the CSV data to add computed fields
    const preprocessedCsv = preprocessProblemsCsv(problemsCsv, rules);

    pendingProblemAttachments.forEach(
        ({ childCode, codeData, allowProblemCreation, allowReadCodeSpecial }) => {
            const rowLogMeta = { ...logMeta, fieldKey: childCode };

            // Initial filter by code using the preprocessed data
            const potentialMatches = preprocessedCsv.filter(
                (p) => p.code === childCode || p.readCode === childCode || p.child === childCode,
            );

            let matchedRowIdx = null;

            const comments = (codeData.comments || "").trim();
            const term = (codeData.c_term || "").toLowerCase();
            const containsBilateral = term.includes("bilateral");

            // Scenario 1: code[comments] = null or empty, code[term] contains Bilateral
            if (!comments || containsBilateral) {
                matchedRowIdx = findRowIdxWithoutLaterality(potentialMatches, childCode, rowLogMeta, features);
            } else {
                // Scenario 2: code[comments] != null
                matchedRowIdx = findRowIdxWithLaterality(potentialMatches, childCode, comments, rowLogMeta, features);
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
                    buildCreateProblemObj(codeData, rules, context, sectionKey, childCode),
                );
            }
        },
    );
};

