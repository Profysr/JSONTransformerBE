import { transformerHelper } from "./src/transformation/transformerHelper.js";
import { deriveJSONRules } from "./src/lib/deriveJSON.js";
import fs from "fs";

console.log("--- TESTING OPTIMIZED HANDLERS ---");

const inputData = JSON.parse(fs.readFileSync("./letter.json", "utf8"));
const rawConfig = JSON.parse(fs.readFileSync("./input.json", "utf8")).config;

const sectionedRules = deriveJSONRules(rawConfig);

const output = transformerHelper(inputData, sectionedRules);

console.log("\n--- METRICS OUTPUT (First 2) ---");
if (output.metrics) {
    console.log(JSON.stringify(output.metrics.slice(0, 2), null, 2));
}

console.log("\n--- READ CODES OUTPUT (First 1) ---");
if (output.letter_codes_list) {
    console.log(JSON.stringify(output.letter_codes_list.slice(0, 1), null, 2));
}

console.log("\n--- VERIFICATION COMPLETE ---");
