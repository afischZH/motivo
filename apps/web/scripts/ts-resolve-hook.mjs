/**
 * Module resolve hook for build scripts that import the workspace's
 * TypeScript sources with Node's built-in type stripping (Node >= 22.18).
 * The sources use bundler-style specifiers, so this adds what Node's ESM
 * resolver does not do by itself:
 * - extensionless relative imports (`./types` -> `./types.ts`, `./dir/index.ts`)
 * - the app's `@/` path alias (tsconfig `paths`)
 * No dependency: registered with `module.register` by the script.
 */
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const APP_ROOT = new URL("../", import.meta.url);
const CANDIDATES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) {
    target = new URL(specifier.slice(2), APP_ROOT).href;
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!context.parentURL) return nextResolve(specifier, context);
    target = new URL(specifier, context.parentURL).href;
  } else {
    return nextResolve(specifier, context);
  }

  if (!isFile(target)) {
    const match = CANDIDATES.map((ext) => target + ext).find(isFile);
    if (match) target = match;
  }
  return nextResolve(target, context);
}
