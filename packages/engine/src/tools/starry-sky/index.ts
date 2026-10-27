/**
 * Starry sky: a vertical gradient through the palette with Poisson-disk
 * distributed stars of varying size and brightness, optional soft glows and a
 * few larger four-pointed sparkles.
 */
import { formatNumber } from "../../curves";
import { createRng, type Rng } from "../../rng";
import { stableId, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";
import { dotSites, effectiveDotSpacing } from "../polka-dots";

/** Most sparkles per render; the schema allows fewer. */
export const MAX_SPARKLES = 24;

export interface StarrySkySvgOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  /** Sky gradient from top to bottom, at least one colour. */
  readonly colors: readonly string[];
  readonly starColor: string;
  /** Minimum distance between stars in px (clamped like Polka Dots' scatter layout). */
  readonly spacing: number;
  /** Largest star diameter relative to the spacing, (0, 1]. */
  readonly size: number;
  /** Random dimming per star, [0, 1]: 0 = all fully bright. */
  readonly twinkle: number;
  /** Glow strength around the larger stars and sparkles, [0, 1]. 0 = no glow. */
  readonly glow: number;
  /** Number of large four-pointed sparkles. */
  readonly sparkles: number;
}

const f = (v: number): string => formatNumber(v, 1);

/** Four-pointed star with concave sides, radius `r` around `c`, as path data. */
export function sparklePath(c: Vec2, r: number): string {
  const k = r * 0.14;
  const p = (x: number, y: number): string => `${f(c.x + x)} ${f(c.y + y)}`;
  return (
    `M${p(0, -r)}Q${p(k, -k)} ${p(r, 0)}Q${p(k, k)} ${p(0, r)}` +
    `Q${p(-k, k)} ${p(-r, 0)}Q${p(-k, -k)} ${p(0, -r)}Z`
  );
}

/** Vertical `<linearGradient>` through `colors`, plus its id. */
function skyGradient(colors: readonly string[]): { id: string; def: string } {
  const n = colors.length;
  const stops = colors
    .map((c, i) => `<stop offset="${formatNumber(n > 1 ? i / (n - 1) : 0, 4)}" stop-color="${c}"/>`)
    .join("");
  const inner = `x1="0" y1="0" x2="0" y2="1">${stops}`;
  const id = stableId("sky", inner);
  return { id, def: `<linearGradient id="${id}" ${inner}</linearGradient>` };
}

export function starrySkySvg(o: StarrySkySvgOptions): string {
  const { width: w, height: h } = o;
  // Sparkles get their own stream, so their placement does not shift the stars.
  const sparkleRng = createRng(o.rng.int(0, 0xffffffff));
  const s = effectiveDotSpacing({ width: w, height: h, layout: "scatter", spacing: o.spacing });
  const sites = dotSites({ width: w, height: h, layout: "scatter", spacing: s, rng: o.rng });
  const maxR = (s * o.size) / 2;

  const inside = sites
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h);
  const sparkleAt = new Map<number, number>();
  const sparkleCount = Math.min(Math.max(Math.round(o.sparkles), 0), MAX_SPARKLES, inside.length);
  for (let tries = 0; sparkleAt.size < sparkleCount && tries < sparkleCount * 8; tries++) {
    const pick = inside[sparkleRng.int(0, inside.length - 1)];
    const radius = Math.max(s * (0.5 + o.size) * sparkleRng.float(0.6, 1), 2);
    if (pick && !sparkleAt.has(pick.i)) sparkleAt.set(pick.i, radius);
  }

  const byOpacity = new Map<string, string[]>();
  const glows: string[] = [];
  const sparkles: string[] = [];
  const glowOn = o.glow > 0;

  sites.forEach((site, i) => {
    // Always draw two values per star so toggling options keeps the sky stable.
    const u = o.rng.next();
    const dim = o.rng.next();
    const sparkle = sparkleAt.get(i);
    if (sparkle !== undefined) {
      sparkles.push(sparklePath(site, sparkle));
      if (glowOn)
        glows.push(
          `<circle cx="${f(site.x)}" cy="${f(site.y)}" r="${f(sparkle * (0.6 + o.glow))}"/>`,
        );
      return;
    }
    // Squared, so small stars are far more common than large ones.
    const r = Math.max(maxR * u * u, 0.3);
    const reach = glowOn ? r * (2 + 6 * o.glow) : r;
    if (site.x + reach < 0 || site.y + reach < 0 || site.x - reach > w || site.y - reach > h)
      return;
    const opacity = formatNumber(Math.round((1 - o.twinkle * dim) * 10) / 10, 1);
    if (opacity === "0") return;
    const el = `<circle cx="${f(site.x)}" cy="${f(site.y)}" r="${f(r)}"/>`;
    const list = byOpacity.get(opacity);
    if (list === undefined) byOpacity.set(opacity, [el]);
    else list.push(el);
    if (glowOn && u * u > 0.55) {
      glows.push(`<circle cx="${f(site.x)}" cy="${f(site.y)}" r="${f(r * (2 + 6 * o.glow))}"/>`);
    }
  });

  const sky = skyGradient(o.colors.length > 0 ? o.colors : ["#000000"]);
  let defs = sky.def;
  let glowLayer = "";
  if (glowOn && glows.length > 0) {
    const inner = `><stop offset="0" stop-color="${o.starColor}" stop-opacity="${formatNumber(0.25 + 0.35 * o.glow, 2)}"/><stop offset="1" stop-color="${o.starColor}" stop-opacity="0"/>`;
    const gid = stableId("glow", inner);
    defs += `<radialGradient id="${gid}"${inner}</radialGradient>`;
    glowLayer = `<g fill="url(#${gid})">${glows.join("")}</g>`;
  }
  const stars = [...byOpacity.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([op, els]) =>
      op === "1"
        ? `<g fill="${o.starColor}">${els.join("")}</g>`
        : `<g fill="${o.starColor}" opacity="${op}">${els.join("")}</g>`,
    )
    .join("");
  const sparkleLayer =
    sparkles.length > 0 ? `<path d="${sparkles.join("")}" fill="${o.starColor}"/>` : "";
  return svgDocument(
    w,
    h,
    `<defs>${defs}</defs><rect width="${f(w)}" height="${f(h)}" fill="url(#${sky.id})"/>${glowLayer}${stars}${sparkleLayer}`,
  );
}
