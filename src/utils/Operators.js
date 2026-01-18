// 1. Static Helpers & Handlers (Defined once, memory efficient)
export const isNumeric = (v) => v !== null && v !== "" && !isNaN(Number(v)) && isFinite(Number(v));

export const getValue = (path, ...sources) => {
    if (typeof path !== "string") return undefined;
    for (const src of sources) {
        if (!src) continue;
        const val = path.includes('.')
            ? path.split(".").reduce((acc, part) => acc?.[part], src)
            : src[path];
        if (val !== undefined) return val;
    }
    return undefined;
};

export const OPERATORS = {
    contains: (s, t, p) => p(s).includes(p(t)),
    not_contains: (s, t, p) => !p(s).includes(p(t)),
    equals: (s, t, p) => isNumeric(s) && isNumeric(t) ? Number(s) === Number(t) : p(s) === p(t),
    not_equals: (s, t, p) => isNumeric(s) && isNumeric(t) ? Number(s) !== Number(t) : p(s) !== p(t),
    starts_with: (s, t, p) => p(s).startsWith(p(t)),
    ends_with: (s, t, p) => p(s).endsWith(p(t)),
    not_starts_with : (s, t, p) => !p(s).startsWith(p(t)),
    not_ends_with: (s, t, p) => !p(s).endsWith(p(t)),
    is_empty: (s) => !s || (typeof s === "string" && !s.trim()) || (Array.isArray(s) && !s.length) || (typeof s === "object" && !Object.keys(s).length),
    is_not_empty: (s) => !OPERATORS.is_empty(s),
    greater_than: (s, t) => isNumeric(s) && isNumeric(t) && Number(s) > Number(t),
    less_than: (s, t) => isNumeric(s) && isNumeric(t) && Number(s) < Number(t),
    less_than_or_equal_to: (src, tgt) =>
        evalNumeric(src, tgt, "less_than_or_equal_to", (s, t) => s <= t),
    greater_than_or_equal_to: (src, tgt) =>
        evalNumeric(src, tgt, "greater_than_or_equal_to", (s, t) => s >= t),
};