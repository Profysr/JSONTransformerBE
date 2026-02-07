import logger from "../../shared/logger.js";
import { isEmpty, resolveDeep } from "../../shared/utils/generalUtils.js";
import { isUnifiedValue } from "../utils/transformationUtils.js";

// ==================
// 1 Core Context Factory
// ==================
export class TransformationContext {
  constructor(inputData) {
    this.originalInput = inputData;
    this.candidates = new Map();
    this.recipient_notes = [];
    this.killResult = null;
  }

  _isTruthy(val) {
    if (isEmpty(val)) return false;
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true";
    return Boolean(val);
  }

  // ==================
  // 2 Candidate Management
  // ==================
  /**
   * Add a candidate value for a specific field.
   */
  addCandidate(key, value, source = "unknown") {
    if (this.killResult) return;

    if (!this.candidates.has(key)) {
      this.candidates.set(key, []);
    }

    if (value && typeof value === "object" && value.isKilled) {
      this.setKilled(value);
      return;
    }

    const resolvedValue = resolveDeep(value, this.originalInput, {}, key, this);

    this.candidates.get(key).push({
      value: resolvedValue,
      source,
      timestamp: Date.now(),
    });

    logger.info(
      `[Context] Added candidate for '${key}': ${JSON.stringify(resolvedValue)} (Source: ${source})`,
    );
  }

  // ==================
  // 3 State Inspection & Snapshot
  // ==================
  /**
   * Inspect all candidates currently stored.
   */
  _viewCandidates(sortBySource = false) {
    const snapshot = {};

    for (const [key, candidates] of this.candidates.entries()) {
      let list = candidates.map((c) => ({
        value: c.value,
        source: c.source,
        timestamp: new Date(c.timestamp).toISOString(),
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
   */
  getCandidate(key) {
    const candidates = this.candidates.get(key);
    if (candidates && candidates.length > 0) {
      const winner = this._pickWinner(candidates);
      if (winner) {
        return isUnifiedValue(winner.value)
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
   */
  setKilled(result) {
    if (!this.killResult) {
      this.killResult = result;
      logger.warn(
        `[Context] Transformation KILLED by ${result.field || "unknown"}.`,
      );
    }
  }

  /**
   * Returns a snapshot of the current state for context resolution.
   */
  getSnapshot() {
    const snapshot = {
      recipient_notes: this.recipient_notes,
    };

    for (const [key, candidates] of this.candidates.entries()) {
      const winner = this._pickWinner(candidates);
      if (winner && !isEmpty(winner.value)) {
        const val = isUnifiedValue(winner.value)
          ? winner.value.primaryValue
          : winner.value;

        if (!isEmpty(val)) {
          snapshot[key] = val;
        }
      }
    }
    return snapshot;
  }

  // ==================
  // 4 Final Output Resolution
  // ==================

  getFinalOutput() {
    if (this.killResult) {
      return this.killResult;
    }

    const output = {};
    // Looking for the first truthy winner value and passing it to output
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

    // Delete empty or null values from the output. Keep neat and clean structure
    const finalOutput = output;
    Object.keys(finalOutput).forEach((key) => {
      if (isEmpty(finalOutput[key]) || finalOutput[key] === "skip") {
        delete finalOutput[key];
      }
    });

    // These are mandatory fields. So, if these are not present in our output, initializing those by default
    ["department", "metrics", "readCodes", "createProblems", "attachProblems"].forEach(
      (field) => {
        if (!finalOutput.hasOwnProperty(field)) {
          finalOutput[field] = field == "department" ? "" : [];
        }
      },
    );

    finalOutput["recipient_notes"] = this.recipient_notes;
    finalOutput["AddNotesToRecipient"] = this.recipient_notes.length > 0;

    return finalOutput;
  }

  // ==================
  // 5 Selection Logic
  // ==================
  _pickWinner(candidates = []) {
    if (candidates && candidates.length == 0) return null;

    return (
      candidates.find(
        (c) => isUnifiedValue(c.value) && this._isTruthy(c.value.primaryValue),
      ) ||
      candidates.find(
        (c) => !isUnifiedValue(c.value) && this._isTruthy(c.value),
      ) ||
      candidates.find((c) => !isEmpty(c.value) && c.value !== "skip") ||
      candidates[0] ||
      null
    );
  }
}
