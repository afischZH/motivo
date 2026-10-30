/**
 * Starburst badge (docs/TOOLS.md D7): a sticker or price badge with a
 * spiky, scalloped, wavy or zigzag edge, an optional inner ring, a die-cut
 * border, a hard offset shadow and up to two lines of text.
 *
 * Pure geometry: the edge is one closed path around the centre, built from
 * `points` repeats of the edge shape. Text is fitted without a DOM with
 * `fitFontSize`, so it never leaves the inner circle.
 */
import { formatNumber } from "../../curves";
import { escapeXml, stableId, svgBackground, svgDocument } from "../../svg";
import { AVATAR_FONT_STACKS, type AvatarFont, estimateTextWidth } from "../avatar";

export const STARBURST_SHAPES = ["spiky", "scallop", "wavy", "zigzag", "circle"] as const;
export type StarburstShape = (typeof STARBURST_SHAPES)[number];

export const STARBURST_RINGS = ["none", "solid", "dashed", "dotted"] as const;
export type StarburstRing = (typeof STARBURST_RINGS)[number];

export const STARBURST_POINTS_MIN = 5;
export const STARBURST_POINTS_MAX = 60;
export const STARBURST_TEXT_MAX = 24;

export interface StarburstOptions {
  readonly width: number;
  readonly height: number;
  /** Solid colour or "transparent". */
  readonly background: string;
  readonly shape: StarburstShape;
  /** Number of spikes, bumps or waves, clamped to [5, 60]. */
  readonly points: number;
  /** Depth of the edge as a share of the radius in [0, 0.5]. */
  readonly depth: number;
  /** Turn of the edge in degrees (the text stays upright unless `tilt`). */
  readonly rotation: number;
  /** Turn of the whole badge including the text, in degrees. */
  readonly tilt: number;
  /** Badge diameter as a share of the shorter side in [0.1, 1]. */
  readonly size: number;
  readonly fill: string;
  /** Optional second colour: a top-to-bottom gradient when set. */
  readonly fill2?: string;
  readonly ink: string;
  readonly ring: StarburstRing;
  /** Die-cut border width as a share of the radius in [0, 0.2]. */
  readonly border: number;
  readonly borderColor: string;
  /** Hard shadow offset as a share of the radius in [0, 0.2]. */
  readonly shadow: number;
  readonly shadowColor: string;
  readonly line1: string;
  readonly line2: string;
  readonly font: AvatarFont;
  readonly fontWeight: number;
  /** Size of the first line as a share of the radius in [0.1, 1]. */
  readonly textSize: number;
  /** Animation time in [0, 1): turns the edge by one point (seamless loop). */
  readonly t?: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const f = (v: number): string => formatNumber(v, 2);

/**
 * Closed edge path around (0, 0) with outer radius `r`. `depth` is how far
 * the edge dips inwards, as a share of `r`.
 */
export function starburstPath(
  shape: StarburstShape,
  points: number,
  r: number,
  depth: number,
  rotation = 0,
): string {
  const n = Math.round(clamp(points, STARBURST_POINTS_MIN, STARBURST_POINTS_MAX));
  const inner = r * (1 - clamp(depth, 0, 0.5));
  const rot = (rotation * Math.PI) / 180 - Math.PI / 2;
  const at = (a: number, radius: number): [number, number] => [
    Math.cos(a + rot) * radius,
    Math.sin(a + rot) * radius,
  ];
  const step = (Math.PI * 2) / n;
  if (shape === "circle" || inner >= r) {
    return `M${f(-r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
  }
  let d = "";
  if (shape === "spiky" || shape === "zigzag") {
    // Spiky: long points between inner corners; zigzag: twice the teeth, half as deep.
    const teeth = shape === "zigzag" ? n * 2 : n;
    const low = shape === "zigzag" ? r - (r - inner) / 2 : inner;
    const s = (Math.PI * 2) / teeth;
    for (let k = 0; k < teeth; k++) {
      const [ox, oy] = at(k * s, r);
      const [ix, iy] = at((k + 0.5) * s, low);
      d += `${k === 0 ? "M" : "L"}${f(ox)} ${f(oy)}L${f(ix)} ${f(iy)}`;
    }
    return `${d}Z`;
  }
  if (shape === "scallop") {
    // Round bumps: a quadratic arc from one inner corner to the next through the outer radius.
    const peak = r + (r - inner);
    for (let k = 0; k < n; k++) {
      const [sx, sy] = at(k * step, inner);
      const [cx, cy] = at((k + 0.5) * step, peak);
      const [ex, ey] = at((k + 1) * step, inner);
      if (k === 0) d += `M${f(sx)} ${f(sy)}`;
      d += `Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`;
    }
    return `${d}Z`;
  }
  // Wavy: a sine round the circle, sampled 8 times per wave and joined smoothly.
  const mid = (r + inner) / 2;
  const amp = (r - inner) / 2;
  const samples = n * 8;
  for (let k = 0; k <= samples; k++) {
    const a = (k / samples) * Math.PI * 2;
    const [x, y] = at(a, mid + amp * Math.cos(a * n));
    d += `${k === 0 ? "M" : "L"}${f(x)} ${f(y)}`;
  }
  return `${d}Z`;
}

export interface StarburstText {
  readonly line1: { readonly size: number; readonly y: number } | null;
  readonly line2: { readonly size: number; readonly y: number } | null;
}

/**
 * Font sizes and baselines (relative to the centre) for the two lines so
 * that both fit the inner circle of radius `inner`.
 */
export function starburstText(o: {
  readonly line1: string;
  readonly line2: string;
  readonly font: AvatarFont;
  readonly inner: number;
  readonly textSize: number;
}): StarburstText {
  const one = o.line1.trim();
  const two = o.line2.trim();
  const box = o.inner * 1.6;
  const fit = (text: string, preferred: number): number => {
    const em = estimateTextWidth(text, o.font);
    return Math.max(1, em > 0 ? Math.min(preferred, box / em) : preferred);
  };
  const s1 = one ? fit(one, o.inner * clamp(o.textSize, 0.1, 1)) : 0;
  const s2 = two ? fit(two, (s1 || o.inner * clamp(o.textSize, 0.1, 1)) * 0.38) : 0;
  if (!one && !two) return { line1: null, line2: null };
  if (!two) return { line1: { size: s1, y: s1 * 0.35 }, line2: null };
  if (!one) return { line1: null, line2: { size: s2, y: s2 * 0.35 } };
  // Stack: first line above, second below, the pair centred as a block.
  const gap = s2 * 0.35;
  const total = s1 * 0.75 + gap + s2 * 0.75;
  const top = -total / 2;
  return {
    line1: { size: s1, y: top + s1 * 0.75 },
    line2: { size: s2, y: top + s1 * 0.75 + gap + s2 * 0.75 },
  };
}

/** Starburst badge as SVG. */
export function starburstSvg(o: StarburstOptions): string {
  const { width: w, height: h } = o;
  const n = Math.round(clamp(o.points, STARBURST_POINTS_MIN, STARBURST_POINTS_MAX));
  const r = (Math.min(w, h) * clamp(o.size, 0.1, 1)) / 2 / 1.12;
  const depth = clamp(o.depth, 0, 0.5);
  const spin = ((o.t ?? 0) * 360) / n;
  const edge = starburstPath(o.shape, n, r, depth, o.rotation + spin);
  const inner = o.shape === "circle" ? r : r * (1 - depth);
  const parts: string[] = [svgBackground(o.background, w, h)];
  const g: string[] = [];
  const border = r * clamp(o.border, 0, 0.2);
  const shadow = r * clamp(o.shadow, 0, 0.2);
  if (shadow > 0) {
    // Hard sticker shadow: the badge outline, offset down and right.
    g.push(
      `<path d="${edge}" transform="translate(${f(shadow)} ${f(shadow)})" fill="${o.shadowColor}"${border > 0 ? ` stroke="${o.shadowColor}" stroke-width="${f(border * 2)}" stroke-linejoin="round"` : ""}/>`,
    );
  }
  if (border > 0) {
    g.push(
      `<path d="${edge}" fill="${o.borderColor}" stroke="${o.borderColor}" stroke-width="${f(border * 2)}" stroke-linejoin="round"/>`,
    );
  }
  let fill = o.fill;
  if (o.fill2) {
    const id = stableId("sb", `${o.fill}${o.fill2}`);
    parts.push(
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.fill}"/><stop offset="1" stop-color="${o.fill2}"/></linearGradient></defs>`,
    );
    fill = `url(#${id})`;
  }
  g.push(`<path d="${edge}" fill="${fill}"/>`);
  if (o.ring !== "none") {
    const rr = inner * 0.86;
    const sw = Math.max(1, r * 0.025);
    const dash =
      o.ring === "dashed"
        ? ` stroke-dasharray="${f(sw * 4)} ${f(sw * 3)}"`
        : o.ring === "dotted"
          ? ` stroke-dasharray="0 ${f(sw * 2.4)}" stroke-linecap="round"`
          : "";
    g.push(
      `<circle r="${f(rr)}" fill="none" stroke="${o.ink}" stroke-opacity="0.85" stroke-width="${f(o.ring === "dotted" ? sw * 1.6 : sw)}"${dash}/>`,
    );
  }
  const text = starburstText({
    line1: o.line1,
    line2: o.line2,
    font: o.font,
    inner: inner * (o.ring === "none" ? 1 : 0.84),
    textSize: o.textSize,
  });
  const family = AVATAR_FONT_STACKS[o.font];
  const weight = Math.round(clamp(o.fontWeight, 100, 900));
  const line = (s: string, l: { size: number; y: number }, wt: number) =>
    `<text x="0" y="${f(l.y)}" text-anchor="middle" font-family="${family}" font-weight="${wt}" font-size="${f(l.size)}" fill="${o.ink}">${escapeXml(s.trim())}</text>`;
  if (text.line1) g.push(line(o.line1, text.line1, weight));
  if (text.line2) g.push(line(o.line2, text.line2, Math.min(900, weight)));
  parts.push(
    `<g transform="translate(${f(w / 2)} ${f(h / 2)}) rotate(${f(o.tilt)})">${g.join("")}</g>`,
  );
  return svgDocument(w, h, parts.join(""));
}
