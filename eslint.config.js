import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node, // Node.js globals like process, __dirname
        ...globals.es2021, // Modern JS globals
      },
    },
    plugins: {
      js,
    },
    extends: [
      js.configs.recommended, // ESLint’s recommended rules for JS
    ],
    rules: {
      semi: ["error", "always"], // enforce semicolons
      quotes: ["error", "double"], // enforce double quotes
      "no-unused-vars": ["warn"], // warn on unused variables
      "no-console": "off", // allow console.log (useful in backend)
    },
  },
]);
