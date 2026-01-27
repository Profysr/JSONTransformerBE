import { Router } from "express";
import { processTransformation } from "../controllers/transformationController.js";
import { parseRules } from "../controllers/ruleParserController.js";
import { deriveJSONRules } from "../lib/deriveJSON.js";
import fs from "fs";
import path from "path";
import catchAsyncHandler from "../middleware/catchAsyncHandler.js";
import { ErrorHandler } from "../middleware/errorHandler.js";

const router = Router();

router.get("/", (req, res) => {
  return res.status(200).send({
    message:
      "Welcome to the Data Transformation API. Use POST /api/v1/transform to transform your data.",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

router.post("/transform/:inst_id", processTransformation);
router.post("/parse-rules", parseRules);


/** Created it for testing purpose */
router.get(
  "/derive_json",
  catchAsyncHandler(async (req, res, next) => {
    const inputPath = path.join(process.cwd(), "rules.json");

    if (!fs.existsSync(inputPath)) {
      return next(new ErrorHandler(404, "rules.json not found"));
    }

    const fileContent = fs.readFileSync(inputPath, "utf-8");
    const json = JSON.parse(fileContent);

    // rules.json has structure { response: { ... }, null_sections: [] }
    const configData = json.response || (Array.isArray(json) ? json[0] : json);
    const result = deriveJSONRules(configData);
    return res.status(200).json(result);
  })
);

export default router;

