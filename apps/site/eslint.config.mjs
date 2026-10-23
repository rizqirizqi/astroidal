import { config } from "@astroidal/eslint-config/react";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: [".webstorio/**"],
  },
];
