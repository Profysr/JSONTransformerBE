import { Router } from "express";
import { processTransformation } from "../controllers/transformationController.js";
import logger from "../lib/logger.js";
import { SERVERS } from "../global/Constants.js";

const router = Router();

router.get("/", (req, res) => {
  return res.status(200).send({
    message:
      "Welcome to the Data Transformation API. Use POST /api/v1/transform to transform your data.",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

router.post("/transform/:inst_id/:letter_type", async (req, res) => {
  const { inst_id, letter_type } = req.params;
  const inputData = req.body || {};

  /** Extract context for logging */
  let nhs_id = inputData?.nhs_id;
  let img_hashes = inputData?.img_hashes;
  img_hashes = Array.isArray(img_hashes) ? img_hashes.join(",") : "";

  /** Defining logs endpoint dynamically */
  let BASE_URL = SERVERS["shary_prod"].BASE_URL;
  let apiEndpoint = `${BASE_URL}/automation_config/transformation_logs/${inst_id
    .toLowerCase()
    .trim()}`;

  // logger.info("Received Req with these parameters:", {
  //   inst_id,
  //   letter_type,
  //   nhsid: nhs_id,
  //   letter_id: inputData?.letter_id || null,
  // });

  try {
    /** send the input data and slug to the transformation */
    const result = processTransformation({
      inst_id: inst_id.trim().toLowerCase(),
      letter_type: letter_type.trim().toLowerCase(),
      inputData,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Route Handler Error:", error);
    return res.status(500).json({
      status: "error",
      ok: false,
      message: "Internal server error during transformation.",
      error: error.message,
    });
  } finally {
    // Invoke logger.sendLogs after processing is complete
    await logger.sendLogs(apiEndpoint, letter_type, nhs_id, img_hashes);
  }
});

export default router;
