import { describe, expect, it } from "vitest";
import { pointCount } from "../../polyline";
import { createRng } from "../../rng";
import {
  FLOW_GRID_SEEDS_MAX,
  FLOW_POISSON_SEEDS_MAX,
  flowSeedSpacing,
  flowUnit,
  FLOW_GRID_CELLS_MAX,
  FLOW_LINES_MAX,
  FLOW_POINTS_MAX,
  flowDirection,
  flowField,
  flowLines,
  flowSvg,
  taperOutline,
  type FlowFieldOptions,
  type FlowLinesOptions,
  type FlowSvgOptions,
} from "./index";

const fieldOpts: Omit<FlowFieldOptions, "rng"> = {
  width: 480,
  height: 320,
  mode: "noise",
  scale: 0.6,
  octaves: 2,
  turbulence: 0.6,
  direction: 0,
};

const lineOpts: Omit<FlowLinesOptions, "rng"> = {
  width: 480,
  height: 320,
  seeding: "poisson",
  spacing: 12,
  separation: 0.5,
  step: 1.5,
  length: 200,
  maxLines: 500,
  margin: 2,
};

const svgOpts: Omit<FlowSvgOptions, "rng"> = {
  width: 480,
  height: 320,
  background: "#0f1222",
  colors: ["#f72585", "#4cc9f0"],
  mode: "noise",
  scale: 60,
  octaves: 2,
  turbulence: 0.6,
  direction: 0,
  seeding: "poisson",
  spacing: 3,
  separation: 0.5,
  step: 3,
  length: 60,
  maxLines: 400,
  lineWidth: 2,
  taper: "none",
  colorMode: "angle",
  opacity: 1,
};

/**
 * Smallest distance between points of two different lines, looked up in a
 * grid of `cell` px; distances of `cell` or more are reported as `cell`.
 */
function minDistanceBetweenLines(lines: { points: number[] }[], cell: number): number {
  const grid = new Map<string, { line: number; x: number; y: number }[]>();
  lines.forEach((l, line) => {
    for (let i = 0; i < l.points.length; i += 2) {
      const x = l.points[i] ?? 0;
      const y = l.points[i + 1] ?? 0;
      const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      const list = grid.get(key) ?? [];
      list.push({ line, x, y });
      grid.set(key, list);
    }
  });
  let best = cell;
  for (const [key, list] of grid) {
    const [cx, cy] = key.split(",").map(Number) as [number, number];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const q of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          for (const p of list) {
            if (p.line === q.line) continue;
            best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
          }
        }
      }
    }
  }
  return best;
}

describe("flowField and flowDirection", () => {
  it("points along the main direction without turbulence", () => {
    const f = flowField({ ...fieldOpts, turbulence: 0, direction: 90, rng: createRng(1) });
    const out: [number, number] = [0, 0];
    expect(flowDirection(f, 100, 100, out)).toBe(true);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(1, 6);
  });

  it("returns unit vectors inside and false outside the sampled area", () => {
    const f = flowField({ ...fieldOpts, rng: createRng(2) });
    const out: [number, number] = [0, 0];
    for (const [x, y] of [
      [0, 0],
      [240, 160],
      [479, 319],
    ] as const) {
      expect(flowDirection(f, x, y, out)).toBe(true);
      expect(Math.hypot(out[0], out[1])).toBeCloseTo(1, 9);
    }
    expect(flowDirection(f, -1000, 0, out)).toBe(false);
    expect(flowDirection(f, Number.NaN, 0, out)).toBe(false);
  });

  it("builds a curl field without sources or sinks (zero divergence)", () => {
    const f = flowField({ ...fieldOpts, mode: "curl", rng: createRng(3) });
    // Discrete divergence of the raw central-difference curl vanishes up to rounding.
    let worst = 0;
    let scale = 0;
    for (let j = 2; j < f.rows - 2; j += 7) {
      for (let i = 2; i < f.cols - 2; i += 7) {
        const k = j * f.cols + i;
        const div =
          (f.vx[k + 1] ?? 0) -
          (f.vx[k - 1] ?? 0) +
          (f.vy[k + f.cols] ?? 0) -
          (f.vy[k - f.cols] ?? 0);
        worst = Math.max(worst, Math.abs(div));
        scale = Math.max(scale, Math.abs(f.vx[k] ?? 0));
      }
    }
    expect(worst).toBeLessThan(scale * 1e-4);
  });

  it("caps the grid for any canvas size", () => {
    const f = flowField({ ...fieldOpts, width: 8192, height: 8192, rng: createRng(1) });
    expect(f.cols * f.rows).toBeLessThanOrEqual(FLOW_GRID_CELLS_MAX);
  });
});

describe("flowLines", () => {
  const field = flowField({ ...fieldOpts, rng: createRng(7) });

  it("is deterministic", () => {
    const a = flowLines(field, { ...lineOpts, rng: createRng(1) });
    expect(flowLines(field, { ...lineOpts, rng: createRng(1) })).toEqual(a);
    expect(a.length).toBeGreaterThan(10);
  });

  it("keeps lines apart by separation × spacing", () => {
    const lines = flowLines(field, { ...lineOpts, rng: createRng(1) });
    const dTest = lineOpts.separation * lineOpts.spacing;
    expect(minDistanceBetweenLines(lines, dTest)).toBeGreaterThanOrEqual(dTest * 0.99);
  });

  it("lets lines touch without separation and honours the line limit", () => {
    const lines = flowLines(field, {
      ...lineOpts,
      seeding: "random",
      separation: 0,
      maxLines: 120,
      rng: createRng(1),
    });
    expect(lines.length).toBeLessThanOrEqual(120);
    expect(lines.length).toBeGreaterThan(100);
    expect(minDistanceBetweenLines(lines, lineOpts.spacing)).toBeLessThan(lineOpts.spacing * 0.5);
  });

  it("limits the length of a line and keeps it near the canvas", () => {
    const lines = flowLines(field, { ...lineOpts, length: 40, separation: 0, rng: createRng(2) });
    for (const line of lines) {
      // Half the length in each direction, in steps of `step`.
      expect(pointCount(line.points)).toBeLessThanOrEqual(2 * Math.ceil(20 / 1.5) + 1);
      for (let i = 0; i < line.points.length; i += 2) {
        expect(line.points[i]).toBeGreaterThanOrEqual(-lineOpts.margin);
        expect(line.points[i]).toBeLessThanOrEqual(lineOpts.width + lineOpts.margin);
      }
    }
  });

  it("seeds on a grid", () => {
    const lines = flowLines(field, {
      ...lineOpts,
      seeding: "grid",
      separation: 0,
      maxLines: 2000,
      // Short lines: 1080 lines of 200 px would exceed the step budget.
      length: 60,
      rng: createRng(3),
    });
    expect(lines.length).toBe(Math.round(480 / 12) * Math.round(320 / 12));
  });

  it("never exceeds the line cap", () => {
    const lines = flowLines(field, {
      ...lineOpts,
      seeding: "random",
      separation: 0,
      length: 5,
      maxLines: 1e6,
      rng: createRng(4),
    });
    expect(lines.length).toBeLessThanOrEqual(FLOW_LINES_MAX);
  });
});

describe("taperOutline", () => {
  it("builds a closed outline twice as long as the line", () => {
    const out = taperOutline([0, 0, 10, 0, 20, 0], 2, () => 1);
    expect(out).toEqual([0, 2, 10, 2, 20, 2, 20, -2, 10, -2, 0, -2]);
  });

  it("follows the width profile along the line", () => {
    const out = taperOutline([0, 0, 10, 0, 20, 0], 2, (s) => 1 - s);
    expect(out[1]).toBeCloseTo(2, 9);
    expect(out[3]).toBeCloseTo(1, 9);
    expect(out[5]).toBeCloseTo(0, 9);
  });

  it("returns nothing for degenerate lines", () => {
    expect(taperOutline([1, 1], 2, () => 1)).toEqual([]);
    expect(taperOutline([1, 1, 1, 1], 2, () => 1)).toEqual([]);
  });
});

describe("flowSvg", () => {
  it("is deterministic and groups lines by colour", () => {
    const a = flowSvg({ ...svgOpts, rng: createRng(1) });
    expect(flowSvg({ ...svgOpts, rng: createRng(1) })).toBe(a);
    expect(flowSvg({ ...svgOpts, rng: createRng(2) })).not.toBe(a);
    expect(a).toContain('stroke-linecap="round"');
    const colors = [...a.matchAll(/stroke="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors.length).toBeLessThanOrEqual(24);
  });

  it("keeps the lines when only the colours change", () => {
    const paths = (svg: string) => [...svg.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]).sort();
    const a = flowSvg({ ...svgOpts, colorMode: "palette", rng: createRng(1) });
    const b = flowSvg({
      ...svgOpts,
      colorMode: "palette",
      colors: ["#000000", "#ffffff"],
      rng: createRng(1),
    });
    expect(paths(a).join("").length).toBe(paths(b).join("").length);
  });

  it("fills tapered outlines and applies the opacity", () => {
    const svg = flowSvg({ ...svgOpts, taper: "both", opacity: 0.5, rng: createRng(1) });
    expect(svg).toContain('<g stroke="none">');
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).toMatch(/ d="M[^"]*Z/);
  });

  it("uses the palette colours as they are in palette mode", () => {
    const svg = flowSvg({ ...svgOpts, colorMode: "palette", rng: createRng(1) });
    const colors = new Set([...svg.matchAll(/stroke="(#[0-9a-f]{6})"/g)].map((m) => m[1]));
    expect([...colors].sort()).toEqual(["#4cc9f0", "#f72585"]);
  });

  it("sends a gap along every line for the animation, starting and ending with the still design", () => {
    const at0 = flowSvg({ ...svgOpts, rng: createRng(1) });
    expect(flowSvg({ ...svgOpts, t: 0, rng: createRng(1) })).toBe(at0);
    expect(flowSvg({ ...svgOpts, t: 1, rng: createRng(1) })).toBe(at0);
    expect(flowSvg({ ...svgOpts, t: 0.3, rng: createRng(1) })).not.toBe(at0);
    const tapered = flowSvg({ ...svgOpts, taper: "both", t: 0.3, rng: createRng(1) });
    expect(tapered).toMatch(/ d="M[^"]*Z/);
  });

  it("stays within the point and size budget on extreme params", () => {
    const svg = flowSvg({
      ...svgOpts,
      width: 1920,
      height: 1080,
      spacing: 1,
      separation: 0,
      seeding: "random",
      maxLines: FLOW_LINES_MAX,
      length: 200,
      step: 1,
      taper: "tail",
      rng: createRng(1),
    });
    const numbers = [...svg.matchAll(/ d="([^"]*)"/g)]
      .map((m) => (m[1] ?? "").match(/-?\d+(?:\.\d+)?/g)?.length ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(numbers / 2).toBeLessThanOrEqual(FLOW_POINTS_MAX + 2500);
    expect(svg.length).toBeLessThan(1_500_000);
  });
});

describe("main-thread budget (M4b-AP05)", () => {
  it("measures sizes in the shorter edge unless the canvas is very elongated", () => {
    expect(flowUnit(1920, 1080)).toBe(1080);
    expect(flowUnit(1080, 1920)).toBe(1080);
    // 8192 × 16 with 1 % spacing asked for 5 million seed points (over 10 s).
    expect(flowUnit(8192, 16)).toBeGreaterThan(100);
    expect(flowUnit(16, 8192)).toBe(flowUnit(8192, 16));
  });

  it("caps the seed candidates on any canvas", () => {
    for (const [w, h] of [
      [1920, 1080],
      [8192, 8192],
      [8192, 16],
    ] as const) {
      const unit = flowUnit(w, h);
      const poisson = flowSeedSpacing(w, h, unit * 0.01, "poisson");
      expect((0.7 * w * h) / poisson ** 2).toBeLessThanOrEqual(FLOW_POISSON_SEEDS_MAX * 1.001);
      const grid = flowSeedSpacing(w, h, unit * 0.01, "grid");
      expect((w * h) / grid ** 2).toBeLessThanOrEqual(FLOW_GRID_SEEDS_MAX * 1.001);
    }
    // Wide spacing stays as it is.
    expect(flowSeedSpacing(1920, 1080, 50, "poisson")).toBe(50);
  });

  it("keeps extreme params on an elongated canvas within the output budget", () => {
    const svg = flowSvg({
      ...svgOpts,
      width: 8192,
      height: 16,
      spacing: 1,
      length: 200,
      step: 1,
      maxLines: FLOW_LINES_MAX,
      rng: createRng(1),
    });
    expect(svg.length).toBeLessThan(FLOW_POINTS_MAX * 14);
  });
});
