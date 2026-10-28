import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  CHART_VALUE_MAX,
  CHART_VALUE_MIN,
  type ChartSvgOptions,
  barPath,
  chartData,
  chartLinePath,
  chartSvg,
  plotArea,
} from "./index";

const opts = (o: Partial<ChartSvgOptions> = {}): ChartSvgOptions => ({
  width: 400,
  height: 300,
  rng: createRng(1),
  background: "#ffffff",
  colors: ["#ff0000", "#0000ff"],
  type: "line",
  series: 2,
  points: 8,
  trend: 0.3,
  volatility: 0.5,
  smoothing: 0.5,
  lineWidth: 3,
  markers: false,
  barGap: 0.3,
  barRadius: 0.5,
  axes: true,
  grid: true,
  axisColor: "#888888",
  margin: 10,
  ...o,
});

describe("chartData", () => {
  const data = (o: Partial<Parameters<typeof chartData>[0]> = {}) =>
    chartData({ rng: createRng(5), series: 3, points: 10, trend: 0, volatility: 0.5, ...o });

  it("returns series x points values within range", () => {
    const rows = data();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveLength(10);
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(CHART_VALUE_MIN);
        expect(v).toBeLessThanOrEqual(CHART_VALUE_MAX);
      }
    }
  });

  it("keeps existing series when the series count changes", () => {
    expect(data({ series: 1 })[0]).toEqual(data({ series: 4 })[0]);
  });

  it("follows the trend", () => {
    const up = data({ trend: 1, volatility: 0 })[0] ?? [];
    const down = data({ trend: -1, volatility: 0 })[0] ?? [];
    expect((up.at(-1) ?? 0) - (up[0] ?? 0)).toBeGreaterThan(0.3);
    expect((down.at(-1) ?? 0) - (down[0] ?? 0)).toBeLessThan(-0.3);
  });

  it("clamps out-of-range counts", () => {
    const rows = data({ series: 99, points: 999 });
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveLength(24);
  });
});

describe("plotArea", () => {
  it("insets by a percentage of the shorter edge", () => {
    expect(plotArea(400, 200, 10)).toEqual({ x: 20, y: 20, w: 360, h: 160 });
  });
});

describe("barPath", () => {
  it("draws square or rounded tops", () => {
    expect(barPath(0, 10, 20, 30, 0)).toBe("M0 40V10H20V40Z");
    expect(barPath(0, 10, 20, 30, 50)).toContain("A10 10 0 0 1 10 10");
  });
});

describe("chartLinePath", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 0 },
  ];
  it("uses straight segments without smoothing and curves with it", () => {
    expect(chartLinePath(pts, 0)).toBe("M0 0L10 5L20 0");
    expect(chartLinePath(pts, 1)).toContain("C");
  });
});

describe("chartSvg", () => {
  it("is deterministic per seed", () => {
    expect(chartSvg(opts())).toBe(chartSvg(opts()));
    expect(chartSvg(opts({ rng: createRng(2) }))).not.toBe(chartSvg(opts()));
  });

  it("draws one stroke per series for lines, plus fills for areas", () => {
    expect(chartSvg(opts({ grid: false, axes: false })).match(/<path /g)).toHaveLength(2);
    const area = chartSvg(opts({ type: "area", grid: false, axes: false }));
    expect(area.match(/fill-opacity="0.22"/g)).toHaveLength(2);
  });

  it("draws one bar per point and series", () => {
    const svg = chartSvg(opts({ type: "bar", grid: false, axes: false, barRadius: 0 }));
    expect(svg.match(/Z/g)).toHaveLength(16);
  });

  it("toggles axes, grid and markers", () => {
    const bare = chartSvg(opts({ axes: false, grid: false }));
    expect(bare).not.toContain('stroke="#888888"');
    expect(chartSvg(opts({ markers: true })).match(/<circle /g)).toHaveLength(16);
  });
});
