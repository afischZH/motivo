// @ts-check
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** The Next.js web app. React and Next rules apply only here. */
const WEB_APP = ["apps/web/**/*.{ts,tsx,js,mjs}"];

/** Packages with React components: hook rules and browser globals apply. */
const REACT_PACKAGES = ["packages/editor-ui/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"];

/** Packages whose output must be reproducible from (params, seed) alone. */
const DETERMINISTIC_PACKAGES = [
  "packages/engine/**",
  "packages/effects/**",
  "packages/shaders/**",
  "packages/tool-registry/src/**",
  "packages/svg-sanitizer/**",
  "packages/scene/src/**",
];

const NON_DETERMINISTIC_MESSAGE =
  "Not allowed in deterministic packages: use the injected seeded Rng (see CLAUDE.md).";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/.open-next/**",
      "**/.wrangler/**",
      "**/next-env.d.ts",
      ".claude/worktrees/**",
    ],
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
        { selector: "CallExpression[callee.name='Date']", message: NON_DETERMINISTIC_MESSAGE },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: NON_DETERMINISTIC_MESSAGE },
        { name: "document", message: NON_DETERMINISTIC_MESSAGE },
        { name: "navigator", message: NON_DETERMINISTIC_MESSAGE },
      ],
    },
  },
  {
    files: WEB_APP,
    ...nextPlugin.configs["core-web-vitals"],
  },
  {
    files: WEB_APP,
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: WEB_APP,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { next: { rootDir: "apps/web/" } },
  },
  {
    files: REACT_PACKAGES,
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: REACT_PACKAGES,
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Browser-side exporters (canvas, clipboard, workers); only used inside functions.
    files: ["packages/exporters/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.worker },
    },
  },
  prettier,
);
