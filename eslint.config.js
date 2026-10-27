// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Packages whose output must be reproducible from (params, seed) alone. */
const DETERMINISTIC_PACKAGES = ["packages/engine/**", "packages/effects/**", "packages/shaders/**"];

const NON_DETERMINISTIC_MESSAGE =
  "Not allowed in deterministic packages: use the injected seeded Rng (see CLAUDE.md).";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**", "**/.turbo/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: DETERMINISTIC_PACKAGES,
    languageOptions: {
      // No DOM globals here on purpose: engine code must run in workers and on the server.
      globals: {},
    },
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: NON_DETERMINISTIC_MESSAGE },
        { object: "Date", property: "now", message: NON_DETERMINISTIC_MESSAGE },
        { object: "performance", property: "now", message: NON_DETERMINISTIC_MESSAGE },
        { object: "crypto", property: "getRandomValues", message: NON_DETERMINISTIC_MESSAGE },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: NON_DETERMINISTIC_MESSAGE },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: NON_DETERMINISTIC_MESSAGE },
        { name: "document", message: NON_DETERMINISTIC_MESSAGE },
        { name: "navigator", message: NON_DETERMINISTIC_MESSAGE },
      ],
    },
  },
  prettier,
);
