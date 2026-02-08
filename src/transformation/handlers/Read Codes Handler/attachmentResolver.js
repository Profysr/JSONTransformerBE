import { buildReadCodeObj, buildCreateProblemObj } from "./builders.js";

export const processProblemAttachments = (
    results,
    pendingProblemAttachments,
    problemsCsv,
    rules,
    context,
) => {
    // 1. If there are no pending problem attachments, return.
    if (pendingProblemAttachments.length === 0) return;

    // 2. If there are no problems in the CSV, return.
    if (!problemsCsv || problemsCsv.length === 0) {
        results.download_problems_csv = true;
        return;
    }

    // 3. Iterate over pending problem attachments.
    pendingProblemAttachments.forEach(
        ({ childCode, codeData, allowProblemCreation, allowReadCodeSpecial }) => {
            const index = problemsCsv.findIndex(
                (p) => p.code === childCode || p.readCode === childCode || p.child === childCode,
            );

            if (index !== -1) {
                results.attachProblems.push(index);
                return;
            }

            if (allowReadCodeSpecial) {
                results.readCodes.push(
                    buildReadCodeObj(codeData, rules, context),
                );
            } else if (allowProblemCreation) {
                results.createProblems.push(
                    buildCreateProblemObj(codeData, rules, context),
                );
            }
        },
    );
};
