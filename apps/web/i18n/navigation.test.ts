/**
 * Landing pages ship no next-intl client code (M2-AP12, Lighthouse): the
 * layout has no NextIntlClientProvider, server links resolve their href on
 * the server and the language switch computes paths without next-intl.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(join(APP, path), "utf8");
const importsOf = (source: string) =>
  [...source.matchAll(/^\s*import\s+(?!type\b)[^'"]*?["']([^"']+)["']/gm)].map(([, s]) => s);

describe("localized navigation", () => {
  it("is only imported from server components (the async Link)", () => {
    const clientFiles = ["app", "components", "lib", "i18n"]
      .flatMap((dir) => walk(join(APP, dir)))
      .filter((file) => /^\s*["']use client["']/.test(readFileSync(file, "utf8")));
    expect(clientFiles.length).toBeGreaterThan(5);
    for (const file of clientFiles) {
      expect(importsOf(readFileSync(file, "utf8")), file).not.toContain("@/i18n/navigation");
    }
  });

  it("keeps next-intl's client out of the shared layout's modules", () => {
    for (const file of [
      "i18n/navigation.tsx",
      "i18n/intent-link.tsx",
      "i18n/paths.ts",
      "i18n/slugs.ts",
      "components/layout/locale-switcher.tsx",
      "components/theme/theme-toggle.tsx",
    ]) {
      const specs = importsOf(read(file));
      expect(
        specs.filter((s) => s === "next-intl" || s.endsWith("navigation-base")),
        file,
      ).toEqual([]);
    }
    expect(read("app/[locale]/layout.tsx")).not.toMatch(/<NextIntlClientProvider/);
  });

  // After `pnpm build`: the chunks a tool landing page loads contain no
  // message formatter. Skipped without build output.
  const html = join(APP, ".next/server/app/de/punktmuster-generator.html");
  it.runIf(existsSync(html))("a landing page loads no message formatter", () => {
    const chunks = [
      ...readFileSync(html, "utf8").matchAll(
        /<script src="\/_next\/static\/chunks\/([^"]+\.js)"(?! noModule)/g,
      ),
    ].map(([, name]) => name);
    expect(chunks.length).toBeGreaterThan(3);
    for (const name of chunks) {
      const code = readFileSync(join(APP, ".next/static/chunks", name ?? ""), "utf8");
      expect(code.includes("IntlMessageFormat"), name).toBe(false);
    }
  });
});
