import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { LIBRARY_FONTS } from "@musterli/scene";
import { describe, expect, it } from "vitest";

import { FONT_SUBSETS, fontFiles } from "@/components/social-editor/font-files";

const PUBLIC = join(__dirname, "..", "..", "public");
/** Upper bound of all font files together (about 780 KiB when written). */
const TOTAL_BUDGET = 900 * 1024;

describe("self-hosted fonts", () => {
  it("ships every file of every library font as WOFF2, plus the OFL text", () => {
    let total = 0;
    for (const font of LIBRARY_FONTS) {
      const files = fontFiles(font);
      expect(files).toHaveLength(font.weights.length * Object.keys(FONT_SUBSETS).length);
      for (const file of files) {
        const path = join(PUBLIC, file.url);
        expect(existsSync(path), file.url).toBe(true);
        const bytes = readFileSync(path);
        expect(bytes.subarray(0, 4).toString("latin1"), file.url).toBe("wOF2");
        total += statSync(path).size;
      }
      const licence = readFileSync(join(PUBLIC, "fonts", font.id, "OFL.txt"), "utf8");
      expect(licence, font.id).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
    expect(total).toBeLessThan(TOTAL_BUDGET);
  });

  it("documents every font in assets/LICENSES.md", () => {
    const licenses = readFileSync(
      join(__dirname, "..", "..", "..", "..", "assets", "LICENSES.md"),
      "utf8",
    );
    for (const font of LIBRARY_FONTS) expect(licenses, font.name).toContain(`| ${font.name} |`);
  });
});
