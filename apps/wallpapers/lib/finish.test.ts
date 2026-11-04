import { DEVICES } from "@musterli/devices";
import { describe, expect, it } from "vitest";

import { clampFinish, composeWallpaper, darkVersion, NO_FINISH } from "./finish";

const base =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800" viewBox="0 0 400 800"><rect width="400" height="800" fill="#f00"/></svg>';
const size = { width: 400, height: 800 };
const phoneZones = DEVICES.find((d) => d.group === "iphone")?.safeZones ?? [];

describe("composeWallpaper", () => {
  it("returns the generator SVG untouched without a finish", () => {
    expect(composeWallpaper(base, size, 1, NO_FINISH, phoneZones)).toBe(base);
  });

  it("wraps the base and adds each layer", () => {
    const svg = composeWallpaper(
      base,
      size,
      1,
      { grain: 40, dim: 20, calmClock: true },
      phoneZones,
    );
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="400" height="800" viewBox="0 0 400 800">/,
    );
    expect(svg.match(/<image /g)).toHaveLength(2);
    expect(svg).toContain("mix-blend-mode:overlay");
    expect(svg).toContain('opacity="0.2"');
    expect(svg).toContain('fill="url(#wp-calm)"');
  });

  it("is deterministic for the same seed", () => {
    const finish = { grain: 30, dim: 0, calmClock: false };
    expect(composeWallpaper(base, size, 7, finish, [])).toBe(
      composeWallpaper(base, size, 7, finish, []),
    );
  });

  it("skips the calm area where there is no clock", () => {
    expect(
      composeWallpaper(base, size, 1, { grain: 0, dim: 0, calmClock: true }, []),
    ).not.toContain("wp-calm");
  });
});

describe("finish values", () => {
  it("clamps and rounds", () => {
    expect(clampFinish({ grain: 120, dim: -5, calmClock: true })).toEqual({
      grain: 100,
      dim: 0,
      calmClock: true,
    });
    expect(clampFinish({ grain: Number.NaN, dim: 99, calmClock: false })).toEqual({
      grain: 0,
      dim: 80,
      calmClock: false,
    });
  });

  it("dims the dark version further, up to the limit", () => {
    expect(darkVersion({ grain: 0, dim: 10, calmClock: false }).dim).toBe(55);
    expect(darkVersion({ grain: 0, dim: 60, calmClock: false }).dim).toBe(80);
  });
});
