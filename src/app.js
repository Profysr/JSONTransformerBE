import express from "express";
import router from "./routes/index.js";
import logger from "./lib/logger.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
  logger.info(`Incoming ${req.method} request to ${req.url}`);
  next();
});

app.get("/", (req, res) => {
  res.send({
    message: "Transformation Module Backend is running",
    docs: "/api/v1",
  });
});

app.use("/api/v1", router);

// --- Server Startup ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(
    `Use POST request to http://localhost:${PORT}/api/v1/transform with your raw JSON in the body.`
  );
});
