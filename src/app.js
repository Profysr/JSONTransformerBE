import express from "express";
import { configDotenv } from "dotenv";
import router from "./routes/index.js";

configDotenv();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1", router);

// --- Server Startup ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(
    `Use POST request to http://localhost:${PORT}/api/v1/transform with your raw JSON in the body.`
  );
});
