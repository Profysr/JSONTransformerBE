import { Router } from "express";
import { processTransformation } from "../controllers/transformationController.js";

const router = Router();

router.get("/", (req, res) => {
  return res.status(200).send({
    message:
      "Welcome to the Data Transformation API. Use POST /api/v1/transform to transform your data.",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

router.post("/transform/:inst_id/:letter_type", (req, res) => {
  try {
    /** Extracting Slug and body from request */
    const { inst_id, letter_type } = req.params;
    const inputData = req.body;
    // console.log("Received Req:", { inst_id, letter_type, inputData });

    /** send the input data and slug to the transformation */
    const result = processTransformation({
      inst_id,
      letter_type,
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
  }
});

export default router;
