import logger from "../../../shared/logger.js";

export const getLateralityMappings = (rules) => {
    const mappingMap = new Map();
    const table = rules.laterality_mappings;

    if (table && Array.isArray(table.value)) {
        table.value.forEach((row) => {
            const side = row.side;
            const mappingsStr = row.mappings || "";
            if (side && mappingsStr) {
                mappingsStr.split(",").forEach((m) => {
                    const trimmed = m.trim().toLowerCase();
                    if (trimmed) mappingMap.set(trimmed, side);
                });
            }
        });
    }

    return mappingMap;
};

export const applyLateralityMapping = (comment, mappingMap) => {
    if (!comment || typeof comment !== "string" || mappingMap.size === 0)
        return comment;

    const words = comment.split(/(\b|\s+|[,.;:!])/);
    return words
        .map((word) => {
            const key = word.trim().toLowerCase();
            return mappingMap.has(key) ? mappingMap.get(key) : word;
        })
        .join("");
};

export const applyForcedMappings = (codesMap, mappings) => {
    mappings.forEach(({ from, to }) => {
        const codeObj = codesMap.get(from);
        if (!codeObj) return;

        logger.info(`Forced mapping: ${from} → ${to}`, { sectionKey: "e2e_config_json", functionName: "applyForcedMappings", fieldKey: from });
        codeObj.child = to;
        codesMap.delete(from);
        codesMap.set(to, codeObj);
    });
};
