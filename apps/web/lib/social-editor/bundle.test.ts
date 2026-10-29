/**
 * Konva (about 46 KB gzip) belongs to the social editor page only: every
 * file imports it as types, except `components/social-editor/konva.ts`,
 * which loads it with dynamic `import()` (its own chunk), and no page but
 * the editor imports the editor component. Landing pages and the rest of
 * the site stay without Konva (checked in the browser by the E2E spec).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = ["app", "components", "lib", "i18n"].flatMap((d) => sources(join(ROOT, d)));
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");

describe("Konva stays on the social editor page", () => {
  it("is imported statically only as types", () => {
    const offenders = files.filter((path) => {
      const text = readFileSync(path, "utf8");
      return /^import\s+(?!type\b)[^;]*from\s+["']konva/m.test(text);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("is loaded with import() in exactly one module", () => {
    const loaders = files.filter((path) => /import\(\s*["']konva/.test(readFileSync(path, "utf8")));
    expect(loaders.map(rel)).toEqual(["components/social-editor/konva.ts"]);
  });

  it("is reachable from the editor page only", () => {
    const pages = files.filter(
      (path) =>
        rel(path).startsWith("app/") &&
        /components\/social-editor\/(social-editor|stage|konva|konva-scene|export)["']/.test(
          readFileSync(path, "utf8"),
        ),
    );
    expect(pages.map(rel)).toEqual(["app/[locale]/social-editor/edit/page.tsx"]);
  });
});
