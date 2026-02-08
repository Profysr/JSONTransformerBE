import logger from "../../shared/logger.js";
import { isEmpty, cleanObject, resolveDeep } from "../../shared/utils/generalUtils.js";
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
    if (typeof val === "string") {
      const lower = val.toLowerCase();
      if (lower === "false" || lower === "skip") return false;
      return true;
    }
    return Boolean(val);
  }

  // ==================
  // 2 Candidate Management
  // ==================
  addCandidate(fieldKey, value, sectionKey = "") {
    if (this.killResult) return;

    if (!this.candidates.has(fieldKey)) {
      this.candidates.set(fieldKey, []);
    }

    if (value && typeof value === "object" && value.isKilled) {
      this.setKilled(value, sectionKey, fieldKey);
      return;
    }

    const resolvedValue = resolveDeep(value, this.originalInput, {}, fieldKey, this, sectionKey);

    this.candidates.get(fieldKey).push({
      value: resolvedValue,
      sectionKey: sectionKey,
      timestamp: Date.now(),
    });
  }

  // ==================
  // 3 State Inspection & Snapshot
  // ==================

  _viewCandidates(sortBySource = false) {
    const snapshot = {};

    for (const [key, candidates] of this.candidates.entries()) {
      let list = candidates.map((c) => ({
        value: c.value,
        sectionKey: c.sectionKey,
        timestamp: new Date(c.timestamp).toISOString(),
      }));

      if (sortBySource) {
        list.sort((a, b) => a.sectionKey.localeCompare(b.sectionKey));
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
  setKilled(result, sectionKey = "", fieldKey = "") {
    if (!this.killResult) {
      this.killResult = result;
      const logMeta = { sectionKey, functionName: "setKilled", fieldKey: fieldKey || result.field };
      logger.warn(
        `Transformation KILLED by ${result.field || "unknown"}.`,
        logMeta
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

    // Use cleanObject to recursively remove null, undefined, and 'skip' values
    const finalOutput = cleanObject(output);

    finalOutput["recipient_notes"] = this.recipient_notes;
    finalOutput["AddNotesToRecipient"] = this.recipient_notes.length > 0;

    return finalOutput;
  }

  /**
   * Applies mandatory default fields to the output.
   * This is typically used by the full transformation engine.
   */
  applyDefaultOutputs(output) {
    if (output && output.isKilled) return output;

    const defaults = ["department", "metrics", "readCodes", "createProblems", "attachProblems"];
    defaults.forEach((field) => {
      if (!output.hasOwnProperty(field)) {
        output[field] = field === "department" ? "" : [];
      }
    });

    return output;
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
