/**
 * M4b-AP05: the preview renders on the main thread (CLAUDE.md: never over
 * 50 ms), so the generative tools cap their work with schema bounds and
 * engine budgets. These are the worst cases found by a random search over
 * the schema bounds and canvas sizes 16 to 8192 px (including 8192 × 16),
 * rendered through the tool's own `render`, the path of preview and export.
 *
 * Measured in Node on the development container (fastest of several runs,
 * before → after the fix): Topo Lines 120 to 365 ms → about 40 ms, Flow
 * Fields up to 12 s (8192 × 16, 1 % spacing) → about 45 ms, Guilloche
 * 0.2 to 0.7 s → about 30 ms, Low-Poly 50 to 57 ms → about 35 ms, Terrazzo
 * 42 ms → about 10 ms. The assertion is deliberately loose (shared CI
 * runners are slower and noisy); it catches lost caps, which cost seconds,
 * not single milliseconds. The engine tests check the caps themselves.
 */
import { describe, expect, it } from "vitest";
import { renderStatic } from "../testing";
import type { AnyToolDefinition, CanvasSize } from "../types";
import { flowFieldTool } from "./flow-field";
import { guillocheTool } from "./guilloche";
import { lowPolyTool } from "./low-poly";
import { screenshotBeautifierTool } from "./screenshot-beautifier";
import { terrazzoTool } from "./terrazzo";
import { topoLinesTool } from "./topo-lines";

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

/** Loose bound per render (see the module comment); the target on a laptop is 50 ms. */
const TEST_BUDGET_MS = 250;
const RUNS = 3;

const WIDE: CanvasSize = { width: 8192, height: 16 };
const TALL: CanvasSize = { width: 16, height: 8192 };
const HD: CanvasSize = { width: 1920, height: 1080 };
const HUGE: CanvasSize = { width: 8192, height: 8192 };

interface WorstCase {
  readonly tool: AnyToolDefinition;
  readonly params: Record<string, unknown>;
  readonly sizes: readonly CanvasSize[];
  readonly t?: number;
}

const CASES: readonly WorstCase[] = [
  {
    tool: topoLinesTool,
    params: {
      scale: 15,
      octaves: 6,
      roughness: 1,
      warp: 1,
      levels: 40,
      style: "bands-lines",
    },
    sizes: [HD, WIDE, TALL, { width: 8192, height: 2048 }],
  },
  {
    tool: topoLinesTool,
    params: { scale: 60, octaves: 6, roughness: 1, warp: 1, levels: 40, style: "bands-lines" },
    sizes: [HD, { width: 1080, height: 1920 }],
  },
  {
    tool: flowFieldTool,
    params: { spacing: 1, length: 200, step: 5.5, maxLines: 4000, lineWidth: 16, opacity: 10 },
    sizes: [WIDE, TALL, HD],
  },
  {
    tool: flowFieldTool,
    params: {
      mode: "curl",
      octaves: 5,
      separation: 1,
      spacing: 1,
      step: 1,
      length: 200,
      maxLines: 4000,
      taper: "both",
    },
    sizes: [TALL, HD, { width: 8192, height: 4608 }],
  },
  {
    tool: flowFieldTool,
    params: { spacing: 1, separation: 0, length: 200, step: 1, maxLines: 4000 },
    sizes: [HD, HUGE],
    t: 0.5,
  },
  {
    tool: guillocheTool,
    params: {
      layout: "frame",
      repeats: 48,
      inner: 0,
      outer: 1,
      curve: "spiro",
      lines: 96,
      petals: 48,
      frequency: 96,
      amplitude: 1,
      colorMode: "along",
      overlay: true,
      overlayCurve: "spiro",
      overlayLines: 96,
      overlayPetals: 48,
      overlayFrequency: 96,
      overlayAmplitude: 1,
    },
    sizes: [
      { width: 1080, height: 1080 },
      { width: 8192, height: 4608 },
    ],
  },
  {
    tool: guillocheTool,
    params: {
      repeats: 25,
      inner: 0,
      outer: 1,
      curve: "spiro",
      lines: 96,
      petals: 48,
      frequency: 1,
      lineWidth: 0.25,
      colorMode: "along",
      overlay: true,
      overlayFrequency: 49,
      overlayAmplitude: 1,
    },
    sizes: [{ width: 1080, height: 1080 }],
  },
  {
    tool: lowPolyTool,
    params: {
      mode: "delaunay",
      spacing: 1,
      variance: 1,
      lighting: 1,
      gap: 12,
      rounding: 20,
      strokeWidth: 8,
    },
    sizes: [HUGE, HD, TALL],
  },
  {
    tool: lowPolyTool,
    params: {
      mode: "voronoi",
      gradient: "mesh",
      spacing: 1,
      variance: 1,
      lighting: 1,
      gap: 12,
      rounding: 20,
      strokeWidth: 8,
    },
    sizes: [HUGE, HD],
    t: 0.5,
  },
  {
    tool: terrazzoTool,
    params: { chipSize: 4, sizeClasses: 2, sizeVariance: 0.8, density: 5, gap: 20, speckles: 50 },
    sizes: [TALL, HD],
  },
  {
    tool: terrazzoTool,
    params: {
      seamless: false,
      chipSize: 4,
      sizeClasses: 3,
      density: 70,
      gap: 20,
      speckles: 100,
      shape: "pebble",
      irregularity: 1,
    },
    sizes: [HUGE, WIDE],
  },
  {
    tool: screenshotBeautifierTool,
    params: { backgroundType: "musterli", backdrop: "mesh-gradient/nebula", shadow: 100 },
    sizes: [HUGE, WIDE],
  },
  {
    // M4b-AP07: four devices with placeholder websites (the most vector work) on a mesh.
    tool: screenshotBeautifierTool,
    params: {
      device: "responsive",
      deviceSet: "all",
      backgroundType: "musterli",
      backdrop: "mesh-gradient/nebula",
      shadow: 100,
    },
    sizes: [HD, HUGE, WIDE, TALL],
  },
];

function fastest(c: WorstCase, size: CanvasSize): number {
  const params = { ...(c.tool.defaults as object), ...c.params };
  let best = Infinity;
  for (let i = 0; i < RUNS; i++) {
    const start = clock.now();
    const out = renderStatic(c.tool, params, 1, size, c.t);
    best = Math.min(best, clock.now() - start);
    expect(out).toBeDefined();
  }
  return best;
}

describe("main-thread budget of the generative tools", () => {
  for (const c of CASES) {
    for (const size of c.sizes) {
      it(`${c.tool.id} ${size.width} × ${size.height} ${JSON.stringify(c.params)}`, () => {
        expect(fastest(c, size)).toBeLessThan(TEST_BUDGET_MS);
      });
    }
  }
});
