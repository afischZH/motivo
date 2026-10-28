import { describe, expect, it } from "vitest";
import {
  type BlobCompositionSvgOptions,
  type CompositionBlob,
  blobCompositionSvg,
  blobPlacement,
  compositionBlobPath,
} from "./index";

const blob = (o: Partial<CompositionBlob> = {}): CompositionBlob => ({
  anchor: "top-left",
  offsetX: 0,
  offsetY: 0,
  size: 50,
  complexity: 6,
  randomness: 0.5,
  variant: 1,
  opacity: 100,
  visible: true,
  ...o,
});

const opts = (o: Partial<BlobCompositionSvgOptions> = {}): BlobCompositionSvgOptions => ({
  width: 400,
  height: 200,
  background: "#ffffff",
  colors: ["#ff0000", "#00ff00", "#0000ff"],
  blobs: [blob(), blob({ anchor: "bottom-right", variant: 2 })],
  fillStyle: "solid",
  strokeWidth: 8,
  gradientAngle: 90,
  ...o,
});

describe("blobPlacement", () => {
  it("anchors to corners, edges and centre with relative offsets", () => {
    expect(blobPlacement(blob(), 400, 200)).toEqual({ cx: 0, cy: 0, radius: 50 });
    expect(blobPlacement(blob({ anchor: "bottom-right" }), 400, 200)).toMatchObject({
      cx: 400,
      cy: 200,
    });
    expect(blobPlacement(blob({ anchor: "center", offsetX: 10, offsetY: -25 }), 400, 200)).toEqual({
      cx: 240,
      cy: 50,
      radius: 50,
    });
    expect(blobPlacement(blob({ anchor: "top" }), 400, 200).cx).toBe(200);
    expect(blobPlacement(blob({ anchor: "left" }), 400, 200).cy).toBe(100);
  });

  it("scales with the canvas (magic resize)", () => {
    const small = blobPlacement(blob({ anchor: "right", offsetX: -10, size: 40 }), 400, 200);
    const large = blobPlacement(blob({ anchor: "right", offsetX: -10, size: 40 }), 800, 400);
    expect(large.cx).toBe(small.cx * 2);
    expect(large.cy).toBe(small.cy * 2);
    expect(large.radius).toBe(small.radius * 2);
  });
});

describe("compositionBlobPath", () => {
  it("depends only on the blob, not on its neighbours", () => {
    const a = compositionBlobPath(blob({ variant: 7 }), 400, 200);
    expect(compositionBlobPath(blob({ variant: 7 }), 400, 200)).toBe(a);
    expect(compositionBlobPath(blob({ variant: 8 }), 400, 200)).not.toBe(a);
  });

  it("scales the same outline with the canvas", () => {
    const small = compositionBlobPath(blob({ anchor: "center" }), 400, 200);
    const large = compositionBlobPath(blob({ anchor: "center" }), 800, 400);
    const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const s = nums(small);
    const l = nums(large);
    expect(l).toHaveLength(s.length);
    l.forEach((v, i) => expect(v).toBeCloseTo((s[i] ?? 0) * 2, 0));
  });
});

describe("blobCompositionSvg", () => {
  it("paints the first blob on top, colours cycle through the palette", () => {
    const svg = blobCompositionSvg(opts());
    const fills = [...svg.matchAll(/<path d="[^"]+" fill="(#[0-9a-f]+)"/g)].map((m) => m[1]);
    expect(fills).toEqual(["#00ff00", "#ff0000"]);
  });

  it("skips hidden and fully transparent blobs and writes partial opacity", () => {
    const svg = blobCompositionSvg(
      opts({
        blobs: [blob({ visible: false }), blob({ opacity: 0 }), blob({ opacity: 40 })],
      }),
    );
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('fill="#0000ff" opacity="0.4"');
  });

  it("supports outline and gradient fills", () => {
    const outline = blobCompositionSvg(opts({ fillStyle: "outline" }));
    expect(outline).toContain('fill="none" stroke="#ff0000" stroke-width="8"');
    const gradient = blobCompositionSvg(opts({ fillStyle: "gradient" }));
    expect(gradient.match(/<linearGradient /g)).toHaveLength(2);
    expect(gradient).toMatch(/fill="url\(#bc[0-9a-z]+\)"/);
  });

  it("omits the background rect when transparent", () => {
    expect(blobCompositionSvg(opts({ background: "transparent" }))).not.toContain("<rect");
  });
});
