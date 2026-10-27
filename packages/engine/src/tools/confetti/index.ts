/**
 * Confetti: small rotated shapes (chips, dots, triangles, squiggles) spread
 * evenly with Poisson-disk sampling. Shapes are written as plain paths with
 * pre-rotated coordinates (no transforms), grouped by colour.
 */
import { formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";
import { dotSites, effectiveDotSpacing } from "../polka-dots";

export const CONFETTI_SHAPES = ["mixed", "rect", "circle", "triangle", "squiggle"] as const;
export type ConfettiShape = (typeof CONFETTI_SHAPES)[number];

/** The concrete shapes `mixed` picks from. */
export const CONFETTI_PIECES = ["rect", "circle", "triangle", "squiggle"] as const;
export type ConfettiPiece = (typeof CONFETTI_PIECES)[number];

export interface ConfettiSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly background: string;
  readonly colors: readonly string[];
  readonly shape: ConfettiShape;
  /** Minimum distance between pieces in px (clamped like Polka Dots' scatter layout). */
  readonly spacing: number;
  /** Piece length relative to the spacing, (0, 1]. */
  readonly size: number;
  /** Random shrink per piece, [0, 1]. */
  readonly sizeVariance: number;
  /** Maximum random rotation in degrees, [0, 180]. 0 keeps every piece upright. */
  readonly rotation: number;
}

const f = (v: number): string => formatNumber(v, 1);
const pt = (p: Vec2): string => `${f(p.x)} ${f(p.y)}`;

/**
 * Outline of one piece of length `len` centred on `c`, rotated by `angle`
 * radians, as SVG path data. Circles are returned as `circle` attributes.
 */
export function confettiPiece(
  kind: ConfettiPiece,
  c: Vec2,
  len: number,
  angle: number,
): { tag: "path" | "circle"; attrs: string; stroke?: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const at = (x: number, y: number): Vec2 => ({
    x: c.x + x * cos - y * sin,
    y: c.y + x * sin + y * cos,
  });
  switch (kind) {
    case "circle":
      return { tag: "circle", attrs: `cx="${f(c.x)}" cy="${f(c.y)}" r="${f(len * 0.35)}"` };
    case "rect": {
      const hw = len / 2;
      const hh = len / 4;
      const d = `M${pt(at(-hw, -hh))}L${pt(at(hw, -hh))}L${pt(at(hw, hh))}L${pt(at(-hw, hh))}Z`;
      return { tag: "path", attrs: `d="${d}"` };
    }
    case "triangle": {
      const r = len / 2;
      const p = [-90, 30, 150].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return at(Math.cos(a) * r, Math.sin(a) * r);
      });
      return { tag: "path", attrs: `d="M${p.map(pt).join("L")}Z"` };
    }
    case "squiggle": {
      // Three half waves along the x axis, as quadratic Béziers.
      const amp = len * 0.3;
      const step = len / 3;
      let d = `M${pt(at(-len / 2, 0))}`;
      for (let i = 0; i < 3; i++) {
        const x = -len / 2 + i * step;
        d += `Q${pt(at(x + step / 2, i % 2 === 0 ? -amp : amp))} ${pt(at(x + step, 0))}`;
      }
      return { tag: "path", attrs: `d="${d}"`, stroke: Math.max(len * 0.14, 0.3) };
    }
  }
}

/** Renders the confetti. The rng drives positions, shapes, colours, sizes and angles. */
export function confettiSvg(o: ConfettiSvgOptions): string {
  const { width: w, height: h } = o;
  const s = effectiveDotSpacing({ width: w, height: h, layout: "scatter", spacing: o.spacing });
  const sites = dotSites({ width: w, height: h, layout: "scatter", spacing: s, rng: o.rng });
  const fills = new Map<string, string[]>();
  const strokes = new Map<string, string[]>();
  const n = o.colors.length;
  const maxAngle = (o.rotation * Math.PI) / 180;

  for (const site of sites) {
    // Always draw four values per piece so changing one option keeps the others stable.
    const kindPick = o.rng.next();
    const colorPick = o.rng.next();
    const shrink = o.rng.next();
    const turn = o.rng.float(-1, 1);

    const len = s * o.size * (1 - o.sizeVariance * shrink);
    if (len < 0.2) continue;
    const reach = len * 0.65;
    if (site.x + reach < 0 || site.y + reach < 0 || site.x - reach > w || site.y - reach > h) {
      continue;
    }
    const kind =
      o.shape === "mixed"
        ? (CONFETTI_PIECES[Math.min(Math.floor(kindPick * 4), 3)] ?? "rect")
        : o.shape;
    const color = o.colors[Math.min(Math.floor(colorPick * n), n - 1)] ?? "#000000";
    const piece = confettiPiece(kind, site, len, turn * maxAngle);
    const target = piece.stroke === undefined ? fills : strokes;
    const el =
      piece.stroke === undefined
        ? `<${piece.tag} ${piece.attrs}/>`
        : `<${piece.tag} ${piece.attrs} stroke-width="${f(piece.stroke)}"/>`;
    const list = target.get(color);
    if (list === undefined) target.set(color, [el]);
    else list.push(el);
  }

  const body =
    [...fills.entries()].map(([c, els]) => `<g fill="${c}">${els.join("")}</g>`).join("") +
    [...strokes.entries()]
      .map(
        ([c, els]) =>
          `<g fill="none" stroke="${c}" stroke-linecap="round" stroke-linejoin="round">${els.join("")}</g>`,
      )
      .join("");
  return svgDocument(w, h, `${svgBackground(o.background, w, h)}${body}`);
}
