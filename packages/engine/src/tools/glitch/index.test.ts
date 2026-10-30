import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  GLITCH_BLOCKS_MAX,
  GLITCH_SLICES_MAX,
  type GlitchOptions,
  glitchLayout,
  glitchSvg,
} from "./index";

const opts = (o: Partial<GlitchOptions> = {}): GlitchOptions => ({
  width: 800,
  height: 600,
  colors: ["#120024", "#7b2ff7", "#f107a3"],
  angle: 135,
  slices: 10,
  shift: 0.3,
  split: 0.6,
  blocks: 12,
  scanlines: 0.5,
  rng: createRng(1),
  ...o,
});

describe("glitchLayout", () => {
  it("clamps the counts", () => {
    const max = glitchLayout(opts({ slices: 99, blocks: 99 }));
    expect(max.slices).toHaveLength(GLITCH_SLICES_MAX);
    expect(max.blocks).toHaveLength(GLITCH_BLOCKS_MAX);
  });

  it("keeps slices and blocks when the counts change", () => {
    const a = glitchLayout(opts({ slices: 5, blocks: 5 }));
    const b = glitchLayout(opts({ slices: 20, blocks: 30 }));
    expect(b.slices.slice(0, 5)).toEqual(a.slices);
    expect(b.blocks.slice(0, 5)).toEqual(a.blocks);
  });

  it("keeps the shift within the limit and slices inside the canvas", () => {
    for (const s of glitchLayout(opts({ slices: 40, shift: 0.2 })).slices) {
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(160);
      expect(s.y + s.height).toBeLessThanOrEqual(600 + 1e-9);
    }
    for (const s of glitchLayout(opts({ shift: 0 })).slices) expect(s.dx).toBeCloseTo(0, 12);
  });
});

describe("glitchSvg", () => {
  it("uses no filter and no gradient href", () => {
    const svg = glitchSvg(opts());
    expect(svg).not.toContain("<filter");
    expect(svg).not.toContain("href=");
  });

  it("draws fringes only with a split and scanlines only when set", () => {
    const plain = glitchSvg(opts({ split: 0, scanlines: 0 }));
    expect(plain).not.toContain("mix-blend-mode:screen");
    expect(plain).not.toContain("<pattern");
    const full = glitchSvg(opts());
    expect(full.match(/mix-blend-mode:screen/g)).toHaveLength(2 * 10);
    expect(full).toContain("<pattern");
  });

  it("is only the base gradient without slices and blocks", () => {
    const svg = glitchSvg(opts({ slices: 0, blocks: 0, scanlines: 0 }));
    expect(svg.match(/<rect /g)).toHaveLength(1);
  });
});
