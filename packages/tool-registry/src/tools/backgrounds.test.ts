/**
 * M3-AP08: tool-level tests of Blob Composition, Doodle Backgrounds and SVG
 * Charts beyond the generic contract and preset snapshots in tools.test.ts.
 */
import { MAX_DOODLES, createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { itemLockKey, parseToolParams } from "../randomize";
import { renderStatic } from "../testing";
import type { BlobCompositionParams } from "./blob-composition";
import { blobCompositionTool, doodlesTool, svgChartsTool } from "./index";

const svg = (out: unknown): string => {
  if (typeof out !== "string") throw new Error("expected an SVG string");
  return out;
};

describe("blob-composition", () => {
  const tool = blobCompositionTool;

  it("keeps the composition when the canvas is resized (magic resize)", () => {
    const nums = (s: string) =>
      [...s.matchAll(/ d="([^"]+)"/g)].flatMap((m) =>
        (m[1]?.match(/-?\d+(\.\d+)?/g) ?? []).map(Number),
      );
    const small = nums(svg(renderStatic(tool, tool.defaults, 1, { width: 960, height: 540 })));
    const large = nums(svg(renderStatic(tool, tool.defaults, 1, { width: 1920, height: 1080 })));
    expect(small.length).toBeGreaterThan(20);
    expect(large).toHaveLength(small.length);
    large.forEach((v, i) => expect(v).toBeCloseTo((small[i] ?? 0) * 2, 0));
  });

  it("does not depend on the seed (shapes come from each blob's variant)", () => {
    const size = { width: 400, height: 300 };
    expect(renderStatic(tool, tool.defaults, 1, size)).toBe(
      renderStatic(tool, tool.defaults, 99, size),
    );
  });

  it("keeps a blob's shape when the blobs are reordered", () => {
    const [a, b] = tool.defaults.blobs;
    if (!a || !b) throw new Error("defaults need two blobs");
    const path = (p: BlobCompositionParams) =>
      svg(
        renderStatic(tool, { ...p, palette: ["#000000", "#000000"] }, 1, {
          width: 400,
          height: 300,
        }),
      )
        .match(/d="[^"]+"/g)
        ?.sort();
    expect(path({ ...tool.defaults, blobs: [a, b] })).toEqual(
      path({ ...tool.defaults, blobs: [b, a] }),
    );
  });

  it("keeps locked item fields and the number of blobs when randomising", () => {
    const locks = new Set([itemLockKey("blobs", 1, "size"), itemLockKey("blobs", 0, "anchor")]);
    const current = tool.defaults;
    const next = tool.randomize(createRng(3), current, locks);
    expect(next.blobs).toHaveLength(current.blobs.length);
    expect(next.blobs[1]?.size).toBe(current.blobs[1]?.size);
    expect(next.blobs[0]?.anchor).toBe(current.blobs[0]?.anchor);
    expect(next.blobs[2]?.variant).not.toBe(current.blobs[2]?.variant);
  });

  it("adds new blobs at a free corner", () => {
    const hint = tool.controls?.params?.blobs?.list;
    const added = hint?.newItem?.(tool.defaults.blobs);
    expect(added && tool.schema.shape.blobs.element.safeParse(added).success).toBe(true);
    expect(tool.defaults.blobs.map((b) => b.anchor)).not.toContain(added?.anchor);
  });

  it("rejects more than eight blobs", () => {
    const blobs = Array.from({ length: 9 }, () => tool.defaults.blobs[0]);
    expect(parseToolParams(tool, { ...tool.defaults, blobs }).success).toBe(false);
  });
});

describe("doodles", () => {
  it("stays within the doodle cap on an extreme share link", () => {
    const params = { ...doodlesTool.defaults, spacing: 4, size: 1.5 };
    const out = svg(renderStatic(doodlesTool, params, 1, { width: 8192, height: 8192 }));
    expect((out.match(/M/g) ?? []).length).toBeLessThanOrEqual(MAX_DOODLES * 2);
  });

  it("draws round-capped strokes in palette colours", () => {
    const out = svg(
      renderStatic(doodlesTool, doodlesTool.defaults, 1, { width: 400, height: 300 }),
    );
    for (const c of doodlesTool.defaults.palette) expect(out).toContain(`stroke="${c}"`);
    expect(out).toContain('stroke-linecap="round"');
  });
});

describe("svg-charts", () => {
  const size = { width: 600, height: 400 };

  it("keeps the data when only the style changes", () => {
    const tops = (s: string) => s.match(/<path d="M[^"]+" fill="none" stroke="#6366f1"/)?.[0];
    const plain = svg(
      renderStatic(svgChartsTool, { ...svgChartsTool.defaults, smoothing: 0 }, 1, size),
    );
    const styled = svg(
      renderStatic(
        svgChartsTool,
        { ...svgChartsTool.defaults, smoothing: 0, axes: false, grid: false, axisColor: "#000000" },
        1,
        size,
      ),
    );
    expect(tops(plain)).toBeDefined();
    expect(tops(styled)).toBe(tops(plain));
  });

  it("draws new data for a new seed", () => {
    expect(renderStatic(svgChartsTool, svgChartsTool.defaults, 2, size)).not.toBe(
      renderStatic(svgChartsTool, svgChartsTool.defaults, 1, size),
    );
  });

  it("keeps the chart style when randomising", () => {
    const current = { ...svgChartsTool.defaults, type: "bar" as const, series: 3, axes: false };
    const next = svgChartsTool.randomize(createRng(1), current, new Set());
    expect(next).toMatchObject({ type: "bar", series: 3, axes: false });
    expect(next.palette).not.toEqual(current.palette);
  });
});
