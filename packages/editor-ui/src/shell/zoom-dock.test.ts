import { describe, expect, it } from "vitest";
import { groupIcon } from "./group-icons";
import { PaletteIcon, SlidersIcon } from "./icons";
import { stepZoom } from "./zoom-dock";

describe("stepZoom", () => {
  it("moves to the next step from any shown scale", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(0.62, 1)).toBe(0.75);
    expect(stepZoom(0.62, -1)).toBe(0.5);
  });

  it("stays within the zoom range", () => {
    expect(stepZoom(4, 1)).toBe(4);
    expect(stepZoom(0.1, -1)).toBe(0.1);
    expect(stepZoom(0.06, -1)).toBe(0.06);
  });
});

describe("groupIcon", () => {
  it("matches common group ids and falls back to sliders", () => {
    expect(groupIcon("colors")).toBe(PaletteIcon);
    expect(groupIcon("something-new")).toBe(SlidersIcon);
    expect(groupIcon(null)).toBe(SlidersIcon);
  });
});
