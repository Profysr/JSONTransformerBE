
import logger from "../lib/logger.js";
import { isUnifiedValue } from "../utils/transformationUtils.js";
import { resolveDeep, isEmpty } from "../utils/util.js";

export class TransformationContext {
    constructor(inputData) {
        this.originalInput = inputData; // Immutable input
        this.candidates = new Map(); // Map<Key, Array<{value, source, isKilled}>>
        this.recipient_notes = [];
        this.killResult = null;
    }

    /**
     * Internal truthy check
     */
    _isTruthy(val) {
        if (isEmpty(val)) return false;
        if (typeof val === "boolean") return val;
        if (typeof val === "string") return val.toLowerCase() === "true";
        return Boolean(val);
    }

    /**
     * Add a candidate value for a specific field.
     * @param {string} key - The field key (e.g., "forwardLetter")
     * @param {any} value - The derived value
     * @param {string} source - Origin of the value (e.g. "Section: metrics")
     */
    addCandidate(key, value, source = "unknown") {
        if (this.killResult) return;

        if (!this.candidates.has(key)) {
            this.candidates.set(key, []);
        }

        // Check if this value itself carries a kill signal (e.g. from generalProcessor)
        if (value && typeof value === "object" && value.isKilled) {
            this.setKilled(value);
            return;
        }

        // Resolve variables recursively
        const resolvedValue = resolveDeep(value, this.originalInput, {}, key, this);

        this.candidates.get(key).push({
            value: resolvedValue,
            source,
            timestamp: Date.now()
        });

        logger.info(`[Context] Added candidate for '${key}': ${JSON.stringify(resolvedValue)} (Source: ${source})`);
    }

    /**
     * Inspect all candidates currently stored.
     * Optionally sort them by source.
     */
    _viewCandidates(sortBySource = false) {
        const snapshot = {};

        for (const [key, candidates] of this.candidates.entries()) {
            let list = candidates.map(c => ({
                value: c.value,
                source: c.source,
                timestamp: new Date(c.timestamp).toISOString()
            }));

            if (sortBySource) {
                list.sort((a, b) => a.source.localeCompare(b.source));
            }

            snapshot[key] = list;
        }

        return snapshot;
    }

    /**
     * Get the current "winning" candidate for a key.
     * Order: Truthy Unified Value > First Non-Empty > First.
     */
    getCandidate(key) {
        const candidates = this.candidates.get(key);
        if (candidates && candidates.length > 0) {
            const winner = this._pickWinner(candidates);
            if (winner) {
                return (isUnifiedValue(winner.value))
                    ? winner.value.primaryValue
                    : winner.value;
            }
        }
        return undefined;
    }

    /**
     * Add a global note
     */
    addNote(note) {
        if (note && typeof note === "string") {
            this.recipient_notes.push(note);
        }
    }

    /**
     * Set the global kill state.
     * Once set, the engine should stop processing.
     */
    setKilled(result) {
        if (!this.killResult) {
            this.killResult = result;
            logger.warn(`[Context] Transformation KILLED by ${result.field || "unknown"}.`);
        }
    }

    /**
     * Returns a snapshot of the current state for context resolution.
     * Contains all "winner" candidates and the recipient_notes array.
     */
    getSnapshot() {
        const snapshot = {
            recipient_notes: this.recipient_notes,
        };

        for (const [key, candidates] of this.candidates.entries()) {
            const winner = this._pickWinner(candidates);
            if (winner && !isEmpty(winner.value)) {
                const val = (isUnifiedValue(winner.value))
                    ? winner.value.primaryValue
                    : winner.value;

                if (!isEmpty(val)) {
                    snapshot[key] = val;
                }
            }
        }
        return snapshot;
    }

    /**
     * Resolve all candidates to the final output object.
     * Strategy:
     * 1. Find the "best" candidate for the field.
     * 2. If it's a unified value, extract primary and dependents.
     * 3. Favor truthy primary values over falsy ones.
     */
    getFinalOutput() {
        if (this.killResult) {
            return this.killResult; // Return the full kill object
        }

        const output = {};

        for (const [key, candidates] of this.candidates.entries()) {
            const winner = this._pickWinner(candidates);
            if (winner) {
                if (isUnifiedValue(winner.value)) {
                    const { primaryValue, ...dependents } = winner.value;
                    output[key] = primaryValue;
                    Object.assign(output, dependents);
                } else {
                    output[key] = winner.value;
                }
            }
        }

        ["metrics", "readCodes", "createProblems", "attachProblems"].forEach(field => {
            if (!output.hasOwnProperty(field)) {
                output[field] = field === "letter_codes" ? "" : [];
            }
        });

        output["recipient_notes"] = this.recipient_notes;
        output["AddNotesToRecipient"] = this.recipient_notes.length > 0;

        // const finalOutput = { ...this.originalInput, ...output };
        const finalOutput = output;
        Object.keys(finalOutput).forEach(key => {
            if (isEmpty(finalOutput[key])) finalOutput[key] = "skip";
        });
        return finalOutput;
    }

    _pickWinner(candidates = []) {
        if (candidates && candidates.length == 0) return null;

        return (candidates.find(c => isUnifiedValue(c.value) && this._isTruthy(c.value.primaryValue)) ||
            candidates.find(c => !isUnifiedValue(c.value) && this._isTruthy(c.value)) ||
            candidates.find(c => !isEmpty(c.value) && c.value !== "skip") ||
            candidates[0] || null);
    }
}
