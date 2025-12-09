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

router.post("/transform", (req, res) => {
  try {
    const inputData = req.body;

    const result = processTransformation(inputData);
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
