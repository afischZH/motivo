import { describe, expect, it } from "vitest";

/**
 * The first import transforms the whole package (and the engine) on demand;
 * under a parallel `turbo test` that alone can take longer than vitest's
 * default 5 s. The test checks that the import works, not how fast it is.
 */
const IMPORT_TIMEOUT_MS = 60_000;

describe("@musterli/exporters entry", () => {
  it(
    "imports without a DOM (server bundles, workers)",
    async () => {
      expect(typeof document).toBe("undefined");
      const mod = await import("./index");
      expect(typeof mod.exportSvg).toBe("function");
      expect(typeof mod.rasterizeSvg).toBe("function");
      expect(typeof mod.copyPng).toBe("function");
    },
    IMPORT_TIMEOUT_MS,
  );
});
