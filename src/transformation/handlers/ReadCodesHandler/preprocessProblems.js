import { getLateralityMappings } from "./mappings.js";


export const extractChildCode = (details) => {
    if (!details) return null;

    // Match code in parentheses at the end of the string
    const match = details.match(/\(([^)]+)\)\s*$/);
    return match ? match[1].trim() : null;
};

export const determineStatus = (notesAndDuration) => {
    if (!notesAndDuration) return "Active";
    return notesAndDuration.includes("End:") ? "Inactive" : "Active";
};

/**
 * Check if text contains a lateral term based on the mapping map
 */
export const findLateralTerm = (text, mappingMap) => {
    if (!text || !mappingMap || mappingMap.size === 0) return "null";

    const lowerText = text.toLowerCase();

    for (const [alias, side] of mappingMap.entries()) {
        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`\\b${escapedAlias}\\b`, "i");

        if (pattern.test(lowerText)) {
            return side;
        }
    }
    return "null";
};


export const preprocessProblemsCsv = (problemsCsv, rules) => {
    if (!problemsCsv || !Array.isArray(problemsCsv)) {
        return [];
    }

    // Generate mapping map from rules
    const mappingMap = getLateralityMappings(rules);

    return problemsCsv.map((problem, index) => {
        // Replace newlines in 'Notes and Duration' with a space
        const notesAndDuration = (problem["Notes and Duration"] || "").replace(/\r\n|\n|\r/g, " ");

        // Extract child code from Details
        const child = extractChildCode(problem.Details);

        // Determine Status
        const Status = determineStatus(notesAndDuration);

        // Determine notesHasLateral
        const notesHasLateral = findLateralTerm(notesAndDuration, mappingMap);

        return {
            ...problem,
            "Notes and Duration": notesAndDuration,
            rowIdx: index,
            child,
            Status,
            notesHasLateral,
        };
    });
};
