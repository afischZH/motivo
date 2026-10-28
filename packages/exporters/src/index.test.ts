import { describe, expect, it } from "vitest";

describe("@musterli/exporters entry", () => {
  it("imports without a DOM (server bundles, workers)", async () => {
    expect(typeof document).toBe("undefined");
    const mod = await import("./index");
    expect(typeof mod.exportSvg).toBe("function");
    expect(typeof mod.rasterizeSvg).toBe("function");
    expect(typeof mod.copyPng).toBe("function");
  });
});
