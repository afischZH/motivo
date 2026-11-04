import { describe, expect, it } from "vitest";

import { formatSize } from "./format";

describe("formatSize", () => {
  it("formats without digit grouping in both locales", () => {
    expect(formatSize(3840, 2160, "en")).toBe("3840 × 2160");
    expect(formatSize(3840, 2160, "de")).toBe("3840 × 2160");
  });
});
