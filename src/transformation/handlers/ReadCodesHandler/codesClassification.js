import logger from "../../../shared/logger.js";
import { isEmpty } from "../../../shared/utils/generalUtils.js";
import { buildReadCodeObj, buildCreateProblemObj } from "./codeTemplates.js";

const isTrue = (v) => v === true || v === "true";
const isFalse = (v) => v === false || v === "false";

const resolveProblemFlag = ({ isDiagnosis, globalValue, rowValue }) => {
    if (!isEmpty(rowValue)) {
        return isTrue(rowValue);
    }
    if (!isDiagnosis) return false;
    return globalValue;
};

const hasSpecialReadBehavior = (codeData) =>
    (codeData.promote_problem && codeData.promote_problem !== "skip") ||
    (codeData.put_summary && codeData.put_summary !== "skip");

export const classifyReadCodes = (
    codesMap,
    rules,
    results,
    pendingProblemAttachments,
    context,
    sectionKey = "",
    features = {},
) => {
    const logMeta = { sectionKey, functionName: "classifyReadCodes" };
    const globalAttach = isTrue(rules.attach_problem);
    const globalCreate = isTrue(rules.create_problem);

    logger.info(`Total codes in map: ${codesMap.size}. Starting classification.`, logMeta);

    codesMap.forEach((codeData, childCode) => {
        const rowLogMeta = { ...logMeta, fieldKey: childCode };
        if (isFalse(codeData.add_code)) return;

        const isDiagnosis = (codeData.type || "").toLowerCase() === "diagnosis";

        let shouldAttachProblem = resolveProblemFlag({
            isDiagnosis,
            globalValue: globalAttach,
            rowValue: codeData.attach_problem,
        });

        // 1. search_codes_in_problems: If enabled, treat EVERY code as if it should be searched in existing problems first.
        if (features.search_codes_in_problems) {
            shouldAttachProblem = true;
        }

        const allowProblemCreation = resolveProblemFlag({
            isDiagnosis,
            globalValue: globalCreate,
            rowValue: codeData.create_problem,
        });

        const allowReadCodeSpecial = hasSpecialReadBehavior(codeData);

        // 6.1 Attach-first path
        if (shouldAttachProblem) {
            pendingProblemAttachments.push({
                childCode,
                codeData,
                attachIfExists: true,
                allowProblemCreation,
                allowReadCodeSpecial,
            });
            logger.info(`Classification result for child ${childCode}: attachProblems`, rowLogMeta);
            return;
        }

        if (allowProblemCreation && !allowReadCodeSpecial) {
            const resultObj = buildCreateProblemObj(codeData, rules, context, sectionKey, childCode);
            results.createProblems.push(resultObj);
            logger.info(`Classification result for child ${childCode}: createProblems`, rowLogMeta);
            return;
        }

        // 6.3 Read code (special or normal)
        const resultObj = buildReadCodeObj(codeData, rules, context, sectionKey, childCode);
        results.readCodes.push(resultObj);
        logger.info(`Classification result for child ${childCode}: readCodes`, rowLogMeta);
    });
};
