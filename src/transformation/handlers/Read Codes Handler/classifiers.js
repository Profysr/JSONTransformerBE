import logger from "../../../shared/logger.js";
import { isEmpty } from "../../../shared/utils/generalUtils.js";
import { buildReadCodeObj, buildCreateProblemObj } from "./builders.js";

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
) => {
    const globalAttach = isTrue(rules.attach_problem);
    const globalCreate = isTrue(rules.create_problem);

    logger.info(`Total codes in map: ${codesMap.size}. Starting classification.`, { sectionKey: "e2e_config_json", functionName: "classifyReadCodes" });

    codesMap.forEach((codeData, childCode) => {
        logger.info(`Classifying code for child ${childCode}`, { ...codeData, sectionKey: "e2e_config_json", functionName: "classifyReadCodes", fieldKey: childCode });
        if (isFalse(codeData.add_code)) return;

        const isDiagnosis = (codeData.type || "").toLowerCase() === "diagnosis";

        const shouldAttachProblem = resolveProblemFlag({
            isDiagnosis,
            globalValue: globalAttach,
            rowValue: codeData.attach_problem,
        });

        const allowProblemCreation = resolveProblemFlag({
            isDiagnosis,
            globalValue: globalCreate,
            rowValue: codeData.create_problem,
        });

        const allowReadCodeSpecial = hasSpecialReadBehavior(codeData);

        // 6.1 Attach-first path (deferred resolution)
        if (shouldAttachProblem) {
            pendingProblemAttachments.push({
                childCode,
                codeData,
                attachIfExists: true,
                allowProblemCreation,
                allowReadCodeSpecial,
            });
            logger.info(`Classification result for child ${childCode}: attachProblems (deferred)`, { childCode, attachIfExists: true, sectionKey: "e2e_config_json", functionName: "classifyReadCodes", fieldKey: childCode });
            return;
        }

        // 6.2 Direct create problem
        if (allowProblemCreation && !allowReadCodeSpecial) {
            const resultObj = buildCreateProblemObj(codeData, rules, context);
            results.createProblems.push(resultObj);
            logger.info(`Classification result for child ${childCode}: createProblems`, { ...resultObj, sectionKey: "e2e_config_json", functionName: "classifyReadCodes", fieldKey: childCode });
            return;
        }

        // 6.3 Read code (special or normal)
        const resultObj = buildReadCodeObj(codeData, rules, context);
        results.readCodes.push(resultObj);
        logger.info(`Classification result for child ${childCode}: readCodes`, { ...resultObj, sectionKey: "e2e_config_json", functionName: "classifyReadCodes", fieldKey: childCode });
    });
};
