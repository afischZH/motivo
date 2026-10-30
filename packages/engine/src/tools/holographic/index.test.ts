import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  HOLO_LAYERS_MAX,
  type HolographicOptions,
  holographicLayout,
  holographicSvg,
} from "./index";

const opts = (o: Partial<HolographicOptions> = {}): HolographicOptions => ({
  width: 800,
  height: 600,
  colors: ["#ff5fd2", "#5fd4ff", "#7dffa8"],
  angle: 60,
  bands: 4,
  layers: 3,
  rings: 1,
  creases: 0.5,
  sheen: 0.3,
  rng: createRng(1),
  ...o,
});

describe("holographicLayout", () => {
  it("clamps the layer count", () => {
    expect(holographicLayout(opts({ layers: 9 })).rings).toHaveLength(HOLO_LAYERS_MAX);
    expect(holographicLayout(opts({ layers: -1 })).rings).toHaveLength(0);
  });

  it("keeps the other rings when the layer count changes", () => {
    const three = holographicLayout(opts({ layers: 3 })).rings;
    const one = holographicLayout(opts({ layers: 1 })).rings;
    expect(one[0]).toEqual(three[0]);
    expect(holographicLayout(opts({ layers: 1 })).sheen).toEqual(
      holographicLayout(opts({ layers: 3 })).sheen,
    );
  });

  it("shrinks the ring repeat with more bands", () => {
    const few = holographicLayout(opts({ bands: 2 })).rings[0]?.r ?? 0;
    const many = holographicLayout(opts({ bands: 8 })).rings[0]?.r ?? 0;
    expect(few / many).toBeCloseTo(4, 9);
  });
});

describe("holographicSvg", () => {
  it("draws mirrored gradients without any filter", () => {
    const svg = holographicSvg(opts());
    expect(svg).not.toContain("<filter");
    expect(svg.match(/spreadMethod="reflect"/g)).toHaveLength(1 + 3 + 1);
    expect(svg).toContain("mix-blend-mode:hard-light");
  });

  it("leaves out rings, creases and sheen at zero", () => {
    const svg = holographicSvg(opts({ rings: 0, creases: 0, sheen: 0 }));
    expect(svg.match(/<rect /g)).toHaveLength(1);
    expect(svg).not.toContain("<ellipse");
  });

  it("is deterministic for a seed and changes with it", () => {
    expect(holographicSvg(opts())).toBe(holographicSvg(opts()));
    expect(holographicSvg(opts({ rng: createRng(2) }))).not.toBe(holographicSvg(opts()));
  });
});
