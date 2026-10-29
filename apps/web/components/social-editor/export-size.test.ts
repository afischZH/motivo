import { describe, expect, it } from "vitest";

import {
  SCENE_EXPORT_EDGE_MAX,
  effectiveExportScale,
  exportOutputSize,
  exportScaleFits,
} from "./export-size";

describe("scene export size", () => {
  it("keeps the requested scale for usual formats", () => {
    expect(effectiveExportScale({ width: 1080, height: 1350 }, 2)).toBe(2);
    expect(exportOutputSize({ width: 1080, height: 1350 }, 2)).toEqual({
      width: 2160,
      height: 2700,
    });
    expect(exportScaleFits({ width: 1080, height: 1350 }, 2)).toBe(true);
  });

  it("caps a 2x export of a huge custom format at the canvas limit", () => {
    const format = { width: 8192, height: 8192 };
    expect(SCENE_EXPORT_EDGE_MAX).toBe(8192);
    expect(effectiveExportScale(format, 2)).toBe(1);
    expect(exportOutputSize(format, 2)).toEqual({ width: 8192, height: 8192 });
    expect(exportScaleFits(format, 2)).toBe(false);
    expect(exportScaleFits(format, 1)).toBe(true);
  });

  it("keeps the aspect ratio when it caps", () => {
    expect(exportOutputSize({ width: 6000, height: 3000 }, 2)).toEqual({
      width: 8192,
      height: 4096,
    });
  });

  it("treats invalid scales as 1x", () => {
    expect(effectiveExportScale({ width: 100, height: 100 }, Number.NaN)).toBe(1);
    expect(effectiveExportScale({ width: 100, height: 100 }, -2)).toBe(1);
  });
});
