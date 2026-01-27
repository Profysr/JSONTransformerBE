import { TransformationContext } from "../transformation/TransformationContext.js";
import { processGeneralRules } from "../transformation/handlers/generalProcessor.js";
import { isUnifiedValue, isTruthy } from "../utils/transformationUtils.js";
import logger from "../lib/logger.js";

// Mock Input Data
const mockInput = {
    nhs_id: "123456",
    letter_type: "Test",
    rpa_notes: "Action Required"
};

// Mock Rules with Unified Values
const mockRules = {
    forwardLetter: {
        primaryValue: "true",
        forwarding_to: "Kynoby Actions",
        forwarding_type: "Group"
    },
    choose_flag: {
        primaryValue: "false",
        flag_color: "URGENT"
    }
};

async function runTest() {
    console.log("Starting Unified Value Implementation Test...");

    const context = new TransformationContext(mockInput);

    // Test processGeneralRules
    console.log("Testing processGeneralRules with Unified Values...");
    processGeneralRules(mockInput, mockRules, context);

    const output = context.getFinalOutput();

    console.log("--- RESULTS ---");
    console.log("forwardLetter:", output.forwardLetter);
    console.log("forwarding_to:", output.forwarding_to);
    console.log("forwarding_type:", output.forwarding_type);
    console.log("choose_flag:", output.choose_flag);
    console.log("flag_color:", output.flag_color);
    console.log("---------------");

    // Assertions
    let passed = true;
    if (output.forwardLetter !== "true") passed = false;
    if (output.forwarding_to !== "Kynoby Actions") passed = false;
    if (output.forwarding_type !== "Group") passed = false;
    if (output.choose_flag !== "false") passed = false;
    if (output.flag_color === "URGENT") passed = false;

    if (passed) {
        console.log("SUCCESS: Unified Value assertions passed!");
    } else {
        console.log("FAILURE: Some assertions failed.");
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
