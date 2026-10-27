/**
 * Layer model of the CSS pattern library (docs/TOOLS.md B1).
 *
 * A pattern is a list of `PatternLayer`s: one CSS gradient image each, either
 * tiled (`tile` = `background-size` in px, `offset` = `background-position`)
 * or covering the whole element. The same list is turned into
 *
 * - CSS declarations (`background-image`, `-size`, `-position`, `-color`), and
 * - an SVG document that paints the same geometry: linear and radial
 *   gradients map to `<linearGradient>`/`<radialGradient>` with the CSS
 *   gradient line computed exactly (`spreadMethod="repeat"` for the
 *   repeating variants), tiles map to `<pattern>`, and conic gradients are
 *   restricted to hard sectors, which are drawn as polygons.
 *
 * Layers are listed top first, as in CSS. Stacking several patterns (layer
 * editor) is a concatenation of their layer lists over one background.
 *
 * Pure and deterministic, no DOM. Colours are validated here as well
 * (defence in depth next to the tool's zod schema), so no caller can inject
 * CSS or markup through a colour string.
 */
import { formatNumber } from "../../curves";
import { stableId, svgBackground, svgDocument } from "../../svg";

/** Which pattern colour a stop uses: primary, accent, or transparent. */
export type Ink = "a" | "b" | null;

export interface PatternStop {
  readonly ink: Ink;
  /** Position: px, percent of the gradient line (linear with unit "%") or degrees (conic). */
  readonly at: number;
  /** Extra opacity factor in [0, 1] on top of the pattern opacity (default 1). */
  readonly alpha?: number;
}

/** Position of a radial or conic centre inside the gradient box. */
export interface PatternPoint {
  readonly x: number;
  readonly y: number;
  /** `px` (default) or percent of the box. */
  readonly unit?: "px" | "%";
}

export type PatternImage =
  | {
      readonly kind: "linear" | "repeating-linear";
      /** CSS angle: 0 = to top, clockwise. */
      readonly angle: number;
      /** Unit of the stop positions. Repeating gradients must use px. */
      readonly unit: "px" | "%";
      readonly stops: readonly PatternStop[];
    }
  | {
      readonly kind: "radial" | "repeating-radial";
      /** Circle centre. */
      readonly at: PatternPoint;
      /** Stops in px from the centre; for `radial` the last one is the radius. */
      readonly stops: readonly PatternStop[];
    }
  | {
      readonly kind: "conic";
      readonly at: PatternPoint;
      /** Start angle in degrees (0 = up, clockwise). */
      readonly from: number;
      /**
       * Hard sectors: each stop ends a sector at `at` degrees (relative to
       * `from`), starting where the previous one ended (or at 0).
       */
      readonly stops: readonly PatternStop[];
    };

export interface PatternLayer {
  readonly image: PatternImage;
  /** Tile size (`background-size`) in px; omitted = the whole element. */
  readonly tile?: { readonly w: number; readonly h: number };
  /** Tile origin (`background-position`) in px. */
  readonly offset?: { readonly x: number; readonly y: number };
}

/** Colours a layer list is painted with. */
export interface PatternPaint {
  /** Primary pattern colour, hex. */
  readonly color: string;
  /** Second pattern colour, hex. */
  readonly accent: string;
  /** Background colour (hex) or "transparent". */
  readonly background: string;
  /** Pattern opacity in [0, 1]; the background stays opaque. */
  readonly opacity: number;
}

/** Most layers a single pattern may use (keeps CSS and SVG small). */
export const MAX_PATTERN_LAYERS = 12;

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

/** `#abc` / `#AABBCC` to lowercase `#aabbcc`. Throws for anything that is not a hex colour. */
export function strictHex(value: string): string {
  if (!HEX.test(value))
    throw new RangeError(`css-patterns: invalid colour ${JSON.stringify(value)}`);
  const hex = value.toLowerCase();
  if (hex.length === 7) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

function checkPaint(paint: PatternPaint): PatternPaint {
  const opacity = Number.isFinite(paint.opacity) ? Math.min(Math.max(paint.opacity, 0), 1) : 1;
  return {
    color: strictHex(paint.color),
    accent: strictHex(paint.accent),
    background: paint.background === "transparent" ? "transparent" : strictHex(paint.background),
    opacity,
  };
}

function checkNumber(value: number, what: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`css-patterns: ${what} is not finite`);
  return value;
}

const f = (v: number): string => formatNumber(checkNumber(v, "number"), 2);
const deg = (v: number): string => `${f(((v % 360) + 360) % 360)}deg`;

interface Resolved {
  /** Lowercase `#rrggbb`. */
  readonly hex: string;
  /** Quantised to 1/255, identical in CSS and SVG. */
  readonly alpha255: number;
}

function inkHex(ink: Exclude<Ink, null>, paint: PatternPaint): string {
  return ink === "a" ? paint.color : paint.accent;
}

/**
 * Colour of every stop. Transparent stops take the colour of the nearest
 * coloured stop (with alpha 0), so SVG, which interpolates without
 * premultiplied alpha, fades exactly like CSS does.
 */
function resolveStops(stops: readonly PatternStop[], paint: PatternPaint): Resolved[] {
  const fallback = stops.find((s) => s.ink !== null);
  return stops.map((stop, i) => {
    if (stop.ink !== null) {
      const alpha = Math.min(Math.max(paint.opacity * (stop.alpha ?? 1), 0), 1);
      return { hex: inkHex(stop.ink, paint), alpha255: Math.round(alpha * 255) };
    }
    let neighbour: PatternStop | undefined;
    for (let d = 1; d < stops.length && !neighbour; d++) {
      const before = stops[i - d];
      const after = stops[i + d];
      if (after && after.ink !== null) neighbour = after;
      else if (before && before.ink !== null) neighbour = before;
    }
    const ink = (neighbour ?? fallback)?.ink ?? "a";
    return { hex: inkHex(ink === null ? "a" : ink, paint), alpha255: 0 };
  });
}

function cssColor(stop: PatternStop, r: Resolved): string {
  if (stop.ink === null) return "transparent";
  if (r.alpha255 >= 255) return r.hex;
  return `${r.hex}${r.alpha255.toString(16).padStart(2, "0")}`;
}

/** Stop list with consecutive stops of one colour merged into two-position stops. */
function cssStops(
  stops: readonly PatternStop[],
  paint: PatternPaint,
  unit: string,
  positions: (stop: PatternStop, i: number) => readonly number[] = (s) => [s.at],
): string {
  const resolved = resolveStops(stops, paint);
  const out: string[] = [];
  let i = 0;
  while (i < stops.length) {
    const stop = stops[i] as PatternStop;
    const color = cssColor(stop, resolved[i] as Resolved);
    const pos = [...positions(stop, i)];
    let j = i + 1;
    while (j < stops.length && pos.length < 2) {
      const next = stops[j] as PatternStop;
      if (cssColor(next, resolved[j] as Resolved) !== color) break;
      pos.push(...positions(next, j));
      j++;
    }
    out.push(
      `${color} ${pos
        .slice(0, 2)
        .map((p) => `${f(p)}${unit}`)
        .join(" ")}`,
    );
    // A third same-coloured stop starts a new entry (rare; keeps output exact).
    i = j;
  }
  return out.join(", ");
}

function cssPoint(p: PatternPoint): string {
  const unit = p.unit ?? "px";
  return `${f(p.x)}${unit} ${f(p.y)}${unit}`;
}

/** The CSS `<image>` of one layer. */
export function layerImageCss(image: PatternImage, paint: PatternPaint): string {
  switch (image.kind) {
    case "linear":
    case "repeating-linear":
      return `${image.kind}-gradient(${deg(image.angle)}, ${cssStops(image.stops, paint, image.unit)})`;
    case "radial": {
      const radius = image.stops[image.stops.length - 1]?.at ?? 0;
      return `radial-gradient(circle ${f(radius)}px at ${cssPoint(image.at)}, ${cssStops(image.stops, paint, "px")})`;
    }
    case "repeating-radial":
      return `repeating-radial-gradient(circle at ${cssPoint(image.at)}, ${cssStops(image.stops, paint, "px")})`;
    case "conic": {
      const starts = image.stops.map((_, i) =>
        i === 0 ? 0 : (image.stops[i - 1] as PatternStop).at,
      );
      const list = cssStops(image.stops, paint, "deg", (s, i) => [starts[i] as number, s.at]);
      return `conic-gradient(from ${deg(image.from)} at ${cssPoint(image.at)}, ${list})`;
    }
  }
}

/** The CSS values of a layer list, one property per key. */
export interface PatternDeclarations {
  /** Absent for a transparent background. */
  readonly backgroundColor?: string;
  readonly backgroundImage: string;
  readonly backgroundSize: string;
  readonly backgroundPosition: string;
}

function checkLayers(layers: readonly PatternLayer[]): void {
  if (layers.length === 0) throw new RangeError("css-patterns: no layers");
  for (const layer of layers) {
    if (layer.tile) {
      checkNumber(layer.tile.w, "tile width");
      checkNumber(layer.tile.h, "tile height");
      if (layer.tile.w <= 0 || layer.tile.h <= 0) {
        throw new RangeError("css-patterns: tile size must be positive");
      }
    }
  }
}

export function patternDeclarations(
  layers: readonly PatternLayer[],
  paintInput: PatternPaint,
): PatternDeclarations {
  checkLayers(layers);
  const paint = checkPaint(paintInput);
  const images = layers.map((l) => layerImageCss(l.image, paint));
  const sizes = layers.map((l) => (l.tile ? `${f(l.tile.w)}px ${f(l.tile.h)}px` : "100% 100%"));
  const positions = layers.map((l) =>
    l.offset && (l.offset.x !== 0 || l.offset.y !== 0)
      ? `${f(l.offset.x)}px ${f(l.offset.y)}px`
      : "0 0",
  );
  return {
    ...(paint.background !== "transparent" ? { backgroundColor: paint.background } : {}),
    backgroundImage: images.join(", "),
    backgroundSize: sizes.join(", "),
    backgroundPosition: positions.join(", "),
  };
}

/** `backgroundImage` to `background-image`. */
function kebab(property: string): string {
  return property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** CSS declarations (no selector), one per line. */
export function declarationsToCss(d: PatternDeclarations): string {
  return Object.entries(d)
    .map(([property, value]) => `${kebab(property)}: ${String(value)};`)
    .join("\n");
}

/**
 * Turns a CSS value into a Tailwind arbitrary value body: spaces become
 * underscores (Tailwind turns them back), existing underscores are escaped.
 */
function tailwindValue(value: string): string {
  return value.trim().replace(/_/g, "\\_").replace(/\s+/g, "_");
}

/** Tailwind classes (v3 and v4): `bg-[colour]` plus arbitrary properties. */
export function declarationsToTailwind(d: PatternDeclarations): string {
  const classes = d.backgroundColor ? [`bg-[${d.backgroundColor}]`] : [];
  for (const [property, value] of Object.entries(d)) {
    if (property === "backgroundColor") continue;
    classes.push(`[${kebab(property)}:${tailwindValue(String(value))}]`);
  }
  return classes.join(" ");
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

function svgStops(
  stops: readonly PatternStop[],
  paint: PatternPaint,
  offset: (stop: PatternStop) => number,
): string {
  const resolved = resolveStops(stops, paint);
  return stops
    .map((stop, i) => {
      const r = resolved[i] as Resolved;
      const o = Math.min(Math.max(offset(stop), 0), 1);
      const opacity =
        r.alpha255 >= 255 ? "" : ` stop-opacity="${formatNumber(r.alpha255 / 255, 4)}"`;
      return `<stop offset="${formatNumber(o, 5)}" stop-color="${r.hex}"${opacity}/>`;
    })
    .join("");
}

function pointPx(p: PatternPoint, w: number, h: number): { x: number; y: number } {
  return p.unit === "%" ? { x: (p.x / 100) * w, y: (p.y / 100) * h } : { x: p.x, y: p.y };
}

/** Point at `angle` (CSS convention: 0 = up, clockwise) and distance `r` from (cx, cy). */
function polar(cx: number, cy: number, angle: number, r: number): string {
  const a = (angle * Math.PI) / 180;
  return `${f(cx + r * Math.sin(a))} ${f(cy - r * Math.cos(a))}`;
}

/**
 * SVG paint server or shapes for one gradient in a box of `w` × `h`
 * (the tile, or the whole element). Returns the defs and the content
 * that fills the box.
 */
function imageSvg(
  image: PatternImage,
  paint: PatternPaint,
  w: number,
  h: number,
  id: string,
): { defs: string; body: string } {
  const box = `<rect width="${f(w)}" height="${f(h)}" fill="url(#${id})"/>`;
  switch (image.kind) {
    case "linear":
    case "repeating-linear": {
      // CSS Images 3: the gradient line passes through the box centre and
      // its length makes the corners hit 0 % and 100 %.
      const a = (image.angle * Math.PI) / 180;
      const dx = Math.sin(a);
      const dy = -Math.cos(a);
      const length = Math.abs(w * dx) + Math.abs(h * dy);
      const x0 = w / 2 - (dx * length) / 2;
      const y0 = h / 2 - (dy * length) / 2;
      const repeating = image.kind === "repeating-linear";
      const toPx = (s: PatternStop) => (image.unit === "%" ? (s.at / 100) * length : s.at);
      const span = repeating ? toPx(image.stops[image.stops.length - 1] as PatternStop) : length;
      const spread = repeating ? ' spreadMethod="repeat"' : "";
      const stops = svgStops(image.stops, paint, (s) => (span > 0 ? toPx(s) / span : 0));
      const defs =
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"${spread} ` +
        `x1="${f(x0)}" y1="${f(y0)}" x2="${f(x0 + dx * span)}" y2="${f(y0 + dy * span)}">` +
        `${stops}</linearGradient>`;
      return { defs, body: box };
    }
    case "radial":
    case "repeating-radial": {
      const c = pointPx(image.at, w, h);
      const r = (image.stops[image.stops.length - 1] as PatternStop).at;
      const spread = image.kind === "repeating-radial" ? ' spreadMethod="repeat"' : "";
      const stops = svgStops(image.stops, paint, (s) => (r > 0 ? s.at / r : 0));
      const defs =
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse"${spread} ` +
        `cx="${f(c.x)}" cy="${f(c.y)}" r="${f(r)}">${stops}</radialGradient>`;
      return { defs, body: box };
    }
    case "conic": {
      const c = pointPx(image.at, w, h);
      // Far enough to leave the box from any centre inside or on its edge.
      const far = 2 * (w + h);
      const resolved = resolveStops(image.stops, paint);
      let start = 0;
      const shapes: string[] = [];
      image.stops.forEach((stop, i) => {
        const end = stop.at;
        const r = resolved[i] as Resolved;
        if (stop.ink !== null && end > start && r.alpha255 > 0) {
          const points = [`M${f(c.x)} ${f(c.y)}`];
          // Vertices every 45 degrees at most, so the far edge stays outside the box.
          const steps = Math.max(1, Math.ceil((end - start) / 45));
          for (let k = 0; k <= steps; k++) {
            points.push(
              `L${polar(c.x, c.y, image.from + start + ((end - start) * k) / steps, far)}`,
            );
          }
          const opacity =
            r.alpha255 >= 255 ? "" : ` fill-opacity="${formatNumber(r.alpha255 / 255, 4)}"`;
          shapes.push(`<path d="${points.join(" ")}Z" fill="${r.hex}"${opacity}/>`);
        }
        start = Math.max(start, end);
      });
      return { defs: "", body: shapes.join("") };
    }
  }
}

/**
 * SVG document that paints the layer list like the CSS declarations would
 * on a `width` × `height` element.
 */
export function patternSvg(
  layers: readonly PatternLayer[],
  paintInput: PatternPaint,
  width: number,
  height: number,
): string {
  checkLayers(layers);
  const paint = checkPaint(paintInput);
  const defs: string[] = [];
  const body: string[] = [svgBackground(paint.background, width, height)];
  // CSS paints the first layer on top: draw from the last to the first.
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i] as PatternLayer;
    const key = `${i}:${layerImageCss(layer.image, paint)}:${JSON.stringify(layer.tile ?? null)}:${JSON.stringify(layer.offset ?? null)}`;
    const gid = stableId("g", key);
    if (layer.tile) {
      const { w, h } = layer.tile;
      const content = imageSvg(layer.image, paint, w, h, gid);
      const pid = stableId("p", key);
      const x = layer.offset?.x ?? 0;
      const y = layer.offset?.y ?? 0;
      defs.push(
        content.defs,
        `<pattern id="${pid}" patternUnits="userSpaceOnUse" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}">${content.body}</pattern>`,
      );
      body.push(`<rect width="${f(width)}" height="${f(height)}" fill="url(#${pid})"/>`);
    } else {
      const content = imageSvg(layer.image, paint, width, height, gid);
      defs.push(content.defs);
      body.push(content.body);
    }
  }
  return svgDocument(width, height, `<defs>${defs.join("")}</defs>${body.join("")}`);
}
