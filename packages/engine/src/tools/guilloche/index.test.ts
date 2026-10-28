import { describe, expect, it } from "vitest";
import {
  GUILLOCHE_CURVES,
  alongSteps,
  bandEdges,
  guillocheMapper,
  guillochePoint,
  guillocheSvg,
  linePhase,
  loopPalette,
  type GuillocheSvgOptions,
  type GuillocheWave,
} from "./index";

const wave = (
  curve: GuillocheWave["curve"],
  extra: Partial<GuillocheWave> = {},
): GuillocheWave => ({
  curve,
  petals: 5,
  frequency: 7,
  amplitude: 0.4,
  spiroRatio: 0.5,
  ...extra,
});

describe("guillochePoint", () => {
  it.each(GUILLOCHE_CURVES)("%s stays inside the band and is periodic", (curve) => {
    for (const amplitude of [0, 0.3, 1]) {
      const w = wave(curve, { amplitude });
      for (let i = 0; i < 200; i++) {
        const t = i / 200;
        const phase = i * 0.37;
        const p = guillochePoint(w, t, phase);
        const q = guillochePoint(w, t + 1, phase);
        expect(p.v).toBeGreaterThanOrEqual(-1e-9);
        expect(p.v).toBeLessThanOrEqual(1 + 1e-9);
        expect(q.u - p.u).toBeCloseTo(1, 9);
        expect(q.v).toBeCloseTo(p.v, 9);
      }
    }
  });

  it("weave without envelope swings between both edges", () => {
    const w = wave("weave", { amplitude: 0, frequency: 1 });
    expect(guillochePoint(w, 0.25, 0).v).toBeCloseTo(1);
    expect(guillochePoint(w, 0.75, 0).v).toBeCloseTo(0);
    expect(guillochePoint(w, 0.3, 0).u).toBe(0.3);
  });

  it("weave pinches the envelope at every petal", () => {
    const w = wave("weave", { amplitude: 1, petals: 4, frequency: 3 });
    // At t = 1/8 the envelope is fully pinched: every line passes the middle.
    for (const phase of [0, 1, 2, 3]) {
      expect(guillochePoint(w, 1 / 8, phase).v).toBeCloseTo(0.5);
    }
  });

  it("phase shifts the lines", () => {
    const w = wave("harmonic");
    expect(guillochePoint(w, 0.1, 0).v).not.toBeCloseTo(guillochePoint(w, 0.1, 1).v);
  });

  it("spiro is a sum of rotating vectors read in polar form", () => {
    const h = 0.4;
    const w = wave("spiro", { petals: 3, frequency: 2, amplitude: 0.25, spiroRatio: h });
    const t = 0.137;
    const x = 2 * Math.PI * t;
    const b = h * 0.75;
    const c = h * 0.25;
    const re = Math.cos(x) + b * Math.cos(x - 3 * x) + c * Math.cos(x + 2 * x);
    const im = Math.sin(x) + b * Math.sin(x - 3 * x) + c * Math.sin(x + 2 * x);
    const p = guillochePoint(w, t, 0);
    const r = 1 - h + 2 * h * p.v;
    expect(r * Math.cos(2 * Math.PI * p.u)).toBeCloseTo(re, 9);
    expect(r * Math.sin(2 * Math.PI * p.u)).toBeCloseTo(im, 9);
  });
});

describe("bandEdges", () => {
  it("orders the edges and keeps them apart", () => {
    expect(bandEdges(0.9, 0.2)).toEqual({ lo: 0.2, hi: 0.9 });
    expect(bandEdges(0.5, 0.5).hi - bandEdges(0.5, 0.5).lo).toBeCloseTo(0.005);
    expect(bandEdges(1, 1)).toEqual({ lo: 0.995, hi: 1 });
    expect(bandEdges(-1, 2)).toEqual({ lo: 0, hi: 1 });
  });
});

describe("guillocheMapper", () => {
  const frame = { width: 800, height: 600, inner: 0.5, outer: 1, rotation: 0 };

  it("rosette maps v to the radius between both edges", () => {
    const m = guillocheMapper({ ...frame, layout: "rosette" });
    expect(m.closed).toBe(true);
    expect(m.map(0, 0)).toEqual({ x: 400 + 150, y: 300 });
    const p = m.map(0.25, 1);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(600);
    const turned = guillocheMapper({ ...frame, layout: "rosette", rotation: 90 }).map(0, 1);
    expect(turned.x).toBeCloseTo(400);
    expect(turned.y).toBeCloseTo(600);
  });

  it("band runs left to right and tiles horizontally", () => {
    const m = guillocheMapper({ ...frame, layout: "band", inner: 0.2, outer: 0.8 });
    expect(m.closed).toBe(false);
    expect(m.map(0, 0)).toEqual({ x: 0, y: 480 });
    expect(m.map(1, 1).x).toBe(800);
    expect(m.map(1, 1).y).toBeCloseTo(120);
    expect(m.map(0.5, 0.5).y).toBeCloseTo(300);
  });

  it("frame is continuous, closed and keeps the outer edge inside the canvas", () => {
    const m = guillocheMapper({ ...frame, layout: "frame", inner: 0.8, outer: 0.95 });
    expect(m.closed).toBe(true);
    for (const v of [0, 0.5, 1]) {
      let prev = m.map(0, v);
      for (let i = 1; i <= 4000; i++) {
        const p = m.map(i / 4000, v);
        expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(3);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(800);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(600);
        prev = p;
      }
      const start = m.map(0, v);
      expect(Math.hypot(prev.x - start.x, prev.y - start.y)).toBeLessThan(1e-6);
    }
    // Top edge: the outer line sits (1 - outer) * half the shorter edge from the top.
    expect(m.map(0.05, 1).y).toBeCloseTo(300 * 0.05);
    expect(m.map(0.05, 0).y).toBeCloseTo(300 * 0.2);
  });

  it("frame on an extreme band still stays finite", () => {
    const m = guillocheMapper({ ...frame, layout: "frame", inner: 0, outer: 1 });
    const p = m.map(0.3, 0.5);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe("helpers", () => {
  it("linePhase spreads the lines over one turn", () => {
    expect(linePhase(0, 4, 1, 0)).toBe(0);
    expect(linePhase(2, 4, 1, 0)).toBeCloseTo(Math.PI);
    expect(linePhase(2, 4, 0.5, 1)).toBeCloseTo(Math.PI / 2 + 1);
    expect(linePhase(3, 4, 0, 0)).toBe(0);
  });

  it("alongSteps scales with the palette within limits", () => {
    expect(alongSteps(1)).toBe(6);
    expect(alongSteps(3)).toBe(18);
    expect(alongSteps(10)).toBe(36);
  });

  it("loopPalette blends back to the first colour", () => {
    const loop = loopPalette(["#ff0000", "#0000ff"], 4);
    expect(loop).toHaveLength(4);
    expect(loop[0]).toBe("#ff0000");
    expect(loop[2]).toBe("#0000ff");
    expect(() => loopPalette([], 3)).toThrow(RangeError);
  });
});

describe("guillocheSvg", () => {
  const base: GuillocheSvgOptions = {
    width: 600,
    height: 600,
    layout: "rosette",
    inner: 0.3,
    outer: 0.9,
    rotation: 0,
    repeats: 4,
    layers: [{ ...wave("weave"), lines: 6, spread: 1, phase: 0 }],
    lineWidth: 1,
    colorMode: "alternate",
    colors: ["#112233", "#445566", "#778899"],
    layerColors: ["#aa5500"],
    gradientAngle: 90,
    background: "#ffffff",
  };
  const paths = (svg: string) => [...svg.matchAll(/<path stroke="([^"]+)" d="([^"]+)"\/>/g)];

  it("groups lines by colour, one closed subpath per line", () => {
    const svg = guillocheSvg(base);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('<rect width="600" height="600" fill="#ffffff"/>');
    const ps = paths(svg);
    expect(ps.map((m) => m[1])).toEqual(["#112233", "#445566", "#778899"]);
    for (const m of ps) expect(m[2]?.match(/M/g)).toHaveLength(2);
    expect(svg.match(/z/g)).toHaveLength(6);
    expect(svg).toContain('stroke-width="1"');
  });

  it("single and blend colour modes", () => {
    expect(paths(guillocheSvg({ ...base, colorMode: "single" })).map((m) => m[1])).toEqual([
      "#112233",
    ]);
    const blend = paths(guillocheSvg({ ...base, colorMode: "blend" })).map((m) => m[1]);
    expect(blend).toHaveLength(6);
    expect(blend[0]).toBe("#112233");
    expect(blend[5]).toBe("#778899");
  });

  it("iris strokes every line with one gradient across the canvas", () => {
    const svg = guillocheSvg({ ...base, colorMode: "iris" });
    const id = /<linearGradient id="([^"]+)" gradientUnits="userSpaceOnUse"/.exec(svg)?.[1];
    expect(id).toBeDefined();
    expect(paths(svg).map((m) => m[1])).toEqual([`url(#${id})`]);
    expect(svg.match(/<stop /g)).toHaveLength(3);
    expect(svg).toContain('x1="0" y1="300" x2="600" y2="300"');
  });

  it("along splits every line into colour steps that loop", () => {
    const svg = guillocheSvg({ ...base, colorMode: "along" });
    const ps = paths(svg);
    expect(ps).toHaveLength(alongSteps(3));
    // Each colour step holds one chunk per line.
    for (const m of ps) expect(m[2]?.match(/M/g)).toHaveLength(6);
  });

  it("draws the second layer in its own colour", () => {
    const svg = guillocheSvg({
      ...base,
      colorMode: "single",
      layers: [...base.layers, { ...wave("spiro"), lines: 3, spread: 1, phase: 0.2 }],
    });
    const ps = paths(svg);
    expect(ps.map((m) => m[1])).toEqual(["#112233", "#aa5500"]);
    expect(ps[1]?.[2]?.match(/M/g)).toHaveLength(3);
  });

  it("band lines are open and run past both edges", () => {
    const svg = guillocheSvg({ ...base, layout: "band", colorMode: "single" });
    expect(svg).not.toContain("z");
    const d = paths(svg)[0]?.[2] ?? "";
    const x0 = Number(/^M(-?[\d.]+)/.exec(d)?.[1]);
    expect(x0).toBeLessThan(0);
  });

  it("transparent background has no rect", () => {
    expect(guillocheSvg({ ...base, background: "transparent" })).not.toContain("<rect");
  });

  it("is deterministic and moves with the animation time", () => {
    const a = guillocheSvg(base);
    expect(guillocheSvg(base)).toBe(a);
    expect(guillocheSvg({ ...base, t: 0 })).toBe(a);
    expect(guillocheSvg({ ...base, t: 0.25 })).not.toBe(a);
  });

  it("keeps extreme params within the point budget", () => {
    const heavy: GuillocheSvgOptions = {
      ...base,
      width: 4000,
      height: 3000,
      layout: "frame",
      repeats: 48,
      inner: 0,
      outer: 1,
      layers: [
        {
          ...wave("weave", { petals: 48, frequency: 96, amplitude: 1 }),
          lines: 96,
          spread: 1,
          phase: 0,
        },
        { ...wave("spiro", { petals: 48, frequency: 96 }), lines: 96, spread: 1, phase: 0 },
      ],
      colorMode: "along",
      colors: [
        "#000000",
        "#ff0000",
        "#00ff00",
        "#0000ff",
        "#ffffff",
        "#123456",
        "#654321",
        "#abcdef",
        "#fedcba",
        "#999999",
      ],
    };
    const svg = guillocheSvg(heavy);
    expect(svg.length).toBeLessThan(1_500_000);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("a smaller budget gives a smaller file", () => {
    const big = guillocheSvg({
      ...base,
      layers: [{ ...wave("spiro"), lines: 40, spread: 1, phase: 0 }],
    });
    const small = guillocheSvg({
      ...base,
      layers: [{ ...wave("spiro"), lines: 40, spread: 1, phase: 0 }],
      pointBudget: 2000,
    });
    expect(small.length).toBeLessThan(big.length / 2);
  });
});
