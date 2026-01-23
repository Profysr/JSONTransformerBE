
import logger from "../lib/logger.js";
import { resolveDeep, isEmpty } from "../utils/util.js";

export class TransformationContext {
    constructor(inputData) {
        this.originalInput = inputData; // Immutable input
        this.candidates = new Map(); // Map<Key, Array<{value, source, isKilled}>>
        this.notes = [];
        this.killResult = null;
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
        const resolvedValue = resolveDeep(value, this.originalInput, {}, key);

        this.candidates.get(key).push({
            value: resolvedValue,
            source,
            timestamp: Date.now()
        });

        logger.info(`[Context] Added candidate for '${key}': ${JSON.stringify(resolvedValue)} (Source: ${source})`);
    }

    /**
     * Get the current "winning" candidate for a key.
     * Strategy: First Match Wins.
     */
    getCandidate(key) {
        const candidates = this.candidates.get(key);
        if (candidates && candidates.length > 0) {
            return candidates[0].value;
        }
        return undefined;
    }

    /**
     * Add a global note
     */
    addNote(note) {
        if (note && typeof note === "string") {
            this.notes.push(note);
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
     * Resolve all candidates to the final output object.
     * Strategy: First Candidate Wins (Index 0).
     */
    getFinalOutput() {
        if (this.killResult) {
            return this.killResult; // Return the full kill object
        }

        const output = {};

        // STRATEGY: First Candidate Wins (Index 0).
        for (const [key, candidates] of this.candidates.entries()) {
            if (candidates.length > 0) {
                // STRATEGY: First Match Wins
                const winner = candidates[0];
                output[key] = winner.value;

                if (candidates.length > 1) {
                    logger.info(`[Context] '${key}' had ${candidates.length} candidates. Selected first: ${JSON.stringify(winner.value)}`);
                }
            }
        }

        // Ensure default empty collections for specific transformed fields if they were not populated
        if (!output.hasOwnProperty("transformed_metrics")) {
            output["transformed_metrics"] = [];
        }
        if (!output.hasOwnProperty("transformed_letter_codes_list")) {
            output["transformed_letter_codes_list"] = [];
        }
        if (!output.hasOwnProperty("transformed_letter_codes")) {
            output["transformed_letter_codes"] = "";
        }

        // Append Notes if any
        if (this.notes.length > 0) {
            output["notes"] = this.notes;
            output["AddNotesToRecipient"] = true;
        } else {
            output["AddNotesToRecipient"] = false;
        }

        const finalOutput = { ...this.originalInput, ...output };

        
        // Clean up: Remove any fields that are empty (null, undefined, or empty string)
        for (const key of Object.keys(finalOutput)) {
            if (isEmpty(finalOutput[key])) {
                finalOutput[key] = "skip";
            }
        }
        // Remove old field names as we have "updated" them to transformed_* versions
        delete finalOutput.metrics;
        delete finalOutput.letter_codes;
        delete finalOutput.letter_codes_list;
        
        return finalOutput;
    }
}
