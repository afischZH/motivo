/**
 * Noise/Grain texture (docs/TOOLS.md E1, standalone variant without image
 * input): a base (solid colour, linear or radial gradient, or transparent)
 * with a seeded grain tile on top, blended with a CSS/SVG blend mode.
 *
 * The grain itself is a raster tile (`grainTile` in `./tile`, encoded by the
 * tool as a PNG data URI) passed in as `tileHref`; this function only builds
 * the SVG around it, so preview and export share one document and every
 * browser shows the same pixels.
 */
import { formatNumber } from "../../curves";
import { bboxGradientVector, stableId, svgDocument } from "../../svg";

export * from "./tile";

export const GRAIN_BASES = ["solid", "linear", "radial", "none"] as const;
/** `none` leaves the canvas transparent: the export is a pure grain overlay. */
export type GrainBase = (typeof GRAIN_BASES)[number];

/** Blend modes of the grain layer; all are standard CSS `mix-blend-mode` values. */
export const GRAIN_BLENDS = ["overlay", "soft-light", "multiply"] as const;
export type GrainBlend = (typeof GRAIN_BLENDS)[number];

export interface NoiseGrainSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly base: GrainBase;
  /** Solid base colour. */
  readonly color: string;
  /** Gradient stops (evenly spaced) for `linear` and `radial`. */
  readonly colors: readonly string[];
  /** Linear gradient angle in degrees, CSS convention (0 = to top). */
  readonly angle: number;
  /** Opacity of the grain layer in [0, 1]. */
  readonly opacity: number;
  readonly blend: GrainBlend;
  /** `data:` URI (or URL) of the seamless grain tile. */
  readonly tileHref: string;
  /** Edge of the square tile in px; it is drawn 1:1 in user units. */
  readonly tileEdge: number;
}

function gradientStops(colors: readonly string[]): string {
  const last = Math.max(1, colors.length - 1);
  return colors
    .map((c, i) => `<stop offset="${formatNumber(i / last, 3)}" stop-color="${c}"/>`)
    .join("");
}

/** `<defs>` content and fill of the base layer, or null for a transparent base. */
function baseFill(o: NoiseGrainSvgOptions): { defs: string; fill: string } | null {
  switch (o.base) {
    case "none":
      return null;
    case "solid":
      return { defs: "", fill: o.color };
    case "linear": {
      const body = `${bboxGradientVector(o.angle)}>${gradientStops(o.colors)}`;
      const id = stableId("l", body);
      return { defs: `<linearGradient id="${id}" ${body}</linearGradient>`, fill: `url(#${id})` };
    }
    case "radial": {
      // r = 0.71 (about sqrt(2) / 2) lets the last stop reach the corners.
      const body = `cx="0.5" cy="0.5" r="0.71">${gradientStops(o.colors)}`;
      const id = stableId("r", body);
      return { defs: `<radialGradient id="${id}" ${body}</radialGradient>`, fill: `url(#${id})` };
    }
  }
}

/** A tiled grain raster blended over a whole canvas (see `grainOverlay`). */
export interface GrainLayer {
  /** `data:` URI (or URL) of the seamless grain tile. */
  readonly href: string;
  /** Edge of the square tile in px; it is drawn 1:1 in user units. */
  readonly edge: number;
  /** Opacity of the grain layer in [0, 1]; clamped. */
  readonly opacity: number;
  readonly blend: GrainBlend;
}

/**
 * The grain layer as SVG parts: a `<pattern>` for `<defs>` and a full-size
 * rect that fills with it, blended with `mix-blend-mode`. The tile uses
 * nearest-neighbour scaling so a scaled preview or a 2x export shows the same
 * grain, only magnified. Both parts are empty at zero opacity. Shared by every
 * tool with a grain option, so all of them render grain the same way.
 */
export function grainOverlay(
  width: number,
  height: number,
  layer: GrainLayer,
): { def: string; rect: string } {
  const opacity = Math.min(1, Math.max(0, layer.opacity));
  if (!(opacity > 0)) return { def: "", rect: "" };
  const t = formatNumber(layer.edge);
  const pattern =
    `<pattern width="${t}" height="${t}" patternUnits="userSpaceOnUse">` +
    `<image width="${t}" height="${t}" style="image-rendering:pixelated" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${layer.href}"/></pattern>`;
  // The id hashes the head of the pattern only: hashing a 250 KB data URI
  // per render would be wasted work, and the tile is unique per document.
  const id = stableId("g", pattern.slice(0, 200) + layer.href.slice(-64));
  return {
    def: pattern.replace("<pattern ", `<pattern id="${id}" `),
    rect:
      `<rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="url(#${id})" ` +
      `opacity="${formatNumber(opacity, 3)}" style="mix-blend-mode:${layer.blend}"/>`,
  };
}

/**
 * SVG document: base rect plus a rect filled with the tiled grain pattern
 * (`grainOverlay`).
 */
export function noiseGrainSvg(o: NoiseGrainSvgOptions): string {
  const w = formatNumber(o.width);
  const h = formatNumber(o.height);
  const base = baseFill(o);
  const grain = grainOverlay(o.width, o.height, {
    href: o.tileHref,
    edge: o.tileEdge,
    opacity: o.opacity,
    blend: o.blend,
  });
  const baseRect = base ? `<rect width="${w}" height="${h}" fill="${base.fill}"/>` : "";
  const defsBody = `${base?.defs ?? ""}${grain.def}`;
  const defs = defsBody ? `<defs>${defsBody}</defs>` : "";
  return svgDocument(o.width, o.height, `${defs}${baseRect}${grain.rect}`);
}
