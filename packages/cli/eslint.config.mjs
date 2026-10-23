import { config } from "@astroidal/eslint-config/base";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ["dist/**"],
  },
  {
    files: ["**/sky-script.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
];
