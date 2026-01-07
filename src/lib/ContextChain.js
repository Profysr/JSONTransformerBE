import logger from "./logger.js";

/**
 * ContextChain.js
 * 
 * Implements a layered context resolution system.
 * 1. Current item (e.g., specific code object)
 * 2. Parent context (e.g., section-level data)
 * 3. Root input data
 */

export class ContextChain {
    /**
     * Array of context objects, ordered from most specific to most general
     */
    constructor(layers) {
        this.layers = layers.filter(layer => layer !== null && layer !== undefined);
    }

    /**
     * Resolve a variable key by checking all context layers
     */
    resolve(key, fieldKey = "") {
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            const value = this.getNestedValue(layer, key);

            if (value !== undefined) {
                const layerName = i === 0 ? "local" : i === this.layers.length - 1 ? "root" : `layer${i}`;
                logger.info(`[${fieldKey}] Field found '${key}' from ${layerName} context -> "${value}"`);
                return value;
            }
        }

        logger.warn(`[${fieldKey}] Field '${key}' not found in any context layer`);
        return undefined;
    }

    /**
     * Get a nested value from an object using dot notation
     */
    getNestedValue(obj, path) {
        if (!obj || typeof obj !== "object") return undefined;

        return path.split(".").reduce((acc, part) => {
            return acc?.[part];
        }, obj);
    }

    /**
     * Check if a key exists in any layer
     */
    has(key) {
        return this.resolve(key) !== undefined;
    }
}
