/**
 * The CSS pattern library (docs/TOOLS.md B1): 34 patterns in five
 * categories, each a pure function from (size, angle) to a layer list that
 * `layers.ts` turns into CSS and SVG. Colours and opacity are applied when
 * painting, so a pattern only says which ink ("a" primary, "b" accent or
 * transparent) goes where.
 *
 * All patterns are our own constructions from generic gradient techniques
 * (hard colour stops, two-position stops, tiling via `background-size`,
 * conic quadrants as rectangles anchored in a tile corner).
 *
 * Conventions: `s` is the size in px (the pattern period); derived lengths
 * are rounded to whole or half pixels so tiles stay crisp. Only patterns
 * made of full-element repeating gradients react to `angle`: rotating a
 * tile would break the seams.
 */
import type { Ink, PatternLayer, PatternStop } from "./layers";

export const PATTERN_CATEGORIES = ["dots", "grid", "stripes", "waves", "geometric"] as const;
export type PatternCategory = (typeof PATTERN_CATEGORIES)[number];

export interface PatternInput {
  /** Pattern period in px. */
  readonly size: number;
  /** Rotation in degrees; only used by rotatable patterns. */
  readonly angle: number;
}

export interface PatternSpec {
  readonly id: string;
  readonly category: PatternCategory;
  /** Whether `angle` changes the output. */
  readonly rotatable: boolean;
  /** Suggested size and angle for this pattern's showcase. */
  readonly size: number;
  readonly angle: number;
  /** Index into `PATTERN_LOOKS`, the showcase colours. */
  readonly look: number;
  layers(input: PatternInput): PatternLayer[];
}

/** Showcase colours (background, primary, accent) used on the library pages. */
export const PATTERN_LOOKS = [
  { background: "#f8f5ee", color: "#1f3a5f", accent: "#e07a5f" },
  { background: "#0f172a", color: "#38bdf8", accent: "#f472b6" },
  { background: "#fef3c7", color: "#b45309", accent: "#0f766e" },
  { background: "#ecfdf5", color: "#047857", accent: "#f59e0b" },
  { background: "#1e1b4b", color: "#a5b4fc", accent: "#facc15" },
  { background: "#fff1f2", color: "#e11d48", accent: "#1d4ed8" },
  { background: "#f1f5f9", color: "#334155", accent: "#94a3b8" },
  { background: "#fdf4ff", color: "#7e22ce", accent: "#14b8a6" },
] as const;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const half = (v: number): number => Math.round(v * 2) / 2;
/** A length of at least `min` px, rounded to whole px. */
const px = (v: number, min = 1): number => Math.max(min, Math.round(v));

/**
 * Stops for bands repeating with period sum(widths). With `soft` edges
 * (against jagged diagonals and circles) the first band is split around 0,
 * so every colour change is inside the period and gets a 1 px transition
 * without a seam at the wrap. Hard bands start at 0: a thin line split
 * across the wrap would fall between pixel centres and vanish in SVG.
 */
export function bandStops(
  bands: readonly (readonly [Ink, number, number?])[],
  soft: boolean,
): PatternStop[] {
  const first = bands[0];
  if (!first) return [];
  const minWidth = Math.min(...bands.map((b) => b[1]));
  const e = soft ? Math.min(0.5, minWidth / 4) : 0;
  const parts = soft
    ? [
        [first[0], first[1] / 2, first[2]] as const,
        ...bands.slice(1),
        [first[0], first[1] / 2, first[2]] as const,
      ]
    : bands;
  const stops: PatternStop[] = [];
  let pos = 0;
  parts.forEach(([ink, width, alpha], i) => {
    const start = i === 0 ? pos : pos + e;
    const end = i === parts.length - 1 ? pos + width : pos + width - e;
    const extra = alpha === undefined ? {} : { alpha };
    stops.push({ ink, at: start, ...extra }, { ink, at: end, ...extra });
    pos += width;
  });
  return stops;
}

/** Soft-edged rings (and a centre disc when the first radius is 0), from the centre out. */
function ringStops(rings: readonly (readonly [Ink, number, number])[]): PatternStop[] {
  const stops: PatternStop[] = [];
  let last = 0;
  for (const [ink, r1, r2] of rings) {
    const e = Math.min(0.5, (r2 - r1) / 4);
    if (r1 > 0) {
      stops.push({ ink: null, at: last }, { ink: null, at: Math.max(last, r1 - e) });
      stops.push({ ink, at: r1 + e });
    } else {
      stops.push({ ink, at: 0 });
    }
    stops.push({ ink, at: r2 - e });
    last = r2 + e;
  }
  stops.push({ ink: null, at: last });
  return stops;
}

const disc = (ink: Ink, r: number) => ringStops([[ink, 0, r]]);

function radial(
  stops: PatternStop[],
  x: number,
  y: number,
  w: number,
  h: number,
  offset?: { x: number; y: number },
): PatternLayer {
  return {
    image: { kind: "radial", at: { x, y }, stops },
    tile: { w, h },
    ...(offset ? { offset } : {}),
  };
}

/** Full-element stripes at `angle`. Soft edges unless the stripes are axis-aligned. */
function stripes(angle: number, bands: readonly (readonly [Ink, number, number?])[]): PatternLayer {
  const soft = Math.abs(angle % 90) > 1e-6;
  return { image: { kind: "repeating-linear", angle, unit: "px", stops: bandStops(bands, soft) } };
}

/** Hard bands across a tile, in px along the gradient line (90 = left to right, 180 = top down). */
function tileBands(
  angle: 90 | 180,
  bands: readonly (readonly [Ink, number])[],
  w: number,
  h: number,
  offset?: { x: number; y: number },
): PatternLayer {
  const stops: PatternStop[] = [];
  let pos = 0;
  for (const [ink, width] of bands) {
    stops.push({ ink, at: pos }, { ink, at: pos + width });
    pos += width;
  }
  return {
    image: { kind: "linear", angle, unit: "px", stops },
    tile: { w, h },
    ...(offset ? { offset } : {}),
  };
}

/** Right triangle in the tile corner the gradient starts from, legs = half the tile (square tiles). */
function cornerTriangle(
  ink: Ink,
  angle: 45 | 135 | 225 | 315,
  s: number,
  offset?: { x: number; y: number },
): PatternLayer {
  return {
    image: { kind: "linear", angle, unit: "%", stops: diagonalEdge(ink, 25, s) },
    tile: { w: s, h: s },
    ...(offset ? { offset } : {}),
  };
}

/**
 * Ink up to `percent` of the gradient line of a square tile at a diagonal
 * angle, with a 1 px soft edge (hard diagonal stops look jagged).
 */
function diagonalEdge(ink: Ink, percent: number, s: number): PatternStop[] {
  const e = (0.5 / (s * Math.SQRT2)) * 100;
  return [
    { ink, at: 0 },
    { ink, at: percent - e },
    { ink: null, at: percent + e },
    { ink: null, at: 100 },
  ];
}

/** Band of width `width` px along a diagonal of a square tile (through two corners). */
function diagonal(ink: Ink, angle: 45 | 135, s: number, width: number): PatternLayer {
  const length = s * Math.SQRT2;
  const w = (width / length) * 100;
  const e = (0.5 / length) * 100;
  return {
    image: {
      kind: "linear",
      angle,
      unit: "%",
      stops: [
        { ink: null, at: 0 },
        { ink: null, at: 50 - w / 2 - e },
        { ink, at: 50 - w / 2 + e },
        { ink, at: 50 + w / 2 - e },
        { ink: null, at: 50 + w / 2 + e },
        { ink: null, at: 100 },
      ],
    },
    tile: { w: s, h: s },
  };
}

/**
 * Rectangle `rw` × `rh` at (x, y) in a `tw` × `th` tile: a conic quadrant
 * anchored at the tile's top-left corner, moved by the tile offset.
 */
function rect(
  ink: Ink,
  rw: number,
  rh: number,
  tw: number,
  th: number,
  x = 0,
  y = 0,
): PatternLayer {
  return {
    image: {
      kind: "conic",
      from: 270,
      at: { x: rw, y: rh },
      stops: [
        { ink, at: 90 },
        { ink: null, at: 360 },
      ],
    },
    tile: { w: tw, h: th },
    ...(x !== 0 || y !== 0 ? { offset: { x, y } } : {}),
  };
}

function zigzagLayers(ink: Ink, s: number, dy = 0): PatternLayer[] {
  const h = s / 2;
  return [
    cornerTriangle(ink, 315, s, { x: h, y: h + dy }),
    cornerTriangle(ink, 45, s, { x: h, y: h + dy }),
    cornerTriangle(ink, 135, s, { x: 0, y: h + dy }),
    cornerTriangle(ink, 225, s, { x: 0, y: h + dy }),
  ];
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

function spec(
  id: string,
  category: PatternCategory,
  options: { rotatable?: boolean; size: number; angle?: number; look: number },
  layers: (input: PatternInput) => PatternLayer[],
): PatternSpec {
  return {
    id,
    category,
    rotatable: options.rotatable ?? false,
    size: options.size,
    angle: options.angle ?? 0,
    look: options.look,
    layers,
  };
}

export const CSS_PATTERNS: readonly PatternSpec[] = [
  // Dots --------------------------------------------------------------------
  spec("polka", "dots", { size: 32, look: 5 }, ({ size: s }) => [
    radial(disc("a", half(s * 0.18)), s / 2, s / 2, s, s),
  ]),
  spec("polka-staggered", "dots", { size: 40, look: 0 }, ({ size: s }) => {
    const r = half(s * 0.13);
    return [
      radial(disc("a", r), s / 4, s / 4, s, s),
      radial(disc("a", r), (3 * s) / 4, (3 * s) / 4, s, s),
    ];
  }),
  spec("dots-duo", "dots", { size: 40, look: 1 }, ({ size: s }) => {
    const r = half(s * 0.13);
    return [
      radial(disc("a", r), s / 4, s / 4, s, s),
      radial(disc("b", r), (3 * s) / 4, (3 * s) / 4, s, s),
    ];
  }),
  spec("dots-mixed", "dots", { size: 28, look: 3 }, ({ size: s }) => {
    const big = half(s * 0.3);
    const small = half(Math.max(1, s * 0.12));
    const t = 2 * s;
    return [
      radial(disc("a", big), s / 2, s / 2, t, t),
      radial(disc("b", big), (3 * s) / 2, (3 * s) / 2, t, t),
      radial(disc("b", small), (3 * s) / 2, s / 2, t, t),
      radial(disc("a", small), s / 2, (3 * s) / 2, t, t),
    ];
  }),
  spec("rings", "dots", { size: 36, look: 4 }, ({ size: s }) => {
    const r2 = half(s * 0.32);
    return [radial(ringStops([["a", Math.max(1, r2 - px(s * 0.08)), r2]]), s / 2, s / 2, s, s)];
  }),
  spec("target", "dots", { size: 48, look: 2 }, ({ size: s }) => {
    const u = s * 0.42;
    return [
      radial(
        ringStops([
          ["a", 0, half(u * 0.22)],
          ["b", half(u * 0.44), half(u * 0.64)],
          ["a", half(u * 0.84), half(u)],
        ]),
        s / 2,
        s / 2,
        s,
        s,
      ),
    ];
  }),

  // Grid --------------------------------------------------------------------
  spec("grid-lines", "grid", { rotatable: true, size: 32, look: 6 }, ({ size: s, angle }) => {
    const w = px(s * 0.05);
    const bands = [
      ["a", w],
      [null, s - w],
    ] as const;
    return [stripes(angle, bands), stripes(angle + 90, bands)];
  }),
  spec("graph-paper", "grid", { rotatable: true, size: 16, look: 0 }, ({ size: s, angle }) => {
    const minor = px(s * 0.06);
    const major = minor * 2;
    const majorBands = [
      ["a", major],
      [null, 5 * s - major],
    ] as const;
    const minorBands = [
      ["b", minor, 0.6],
      [null, s - minor],
    ] as const;
    return [
      stripes(angle, majorBands),
      stripes(angle + 90, majorBands),
      stripes(angle, minorBands),
      stripes(angle + 90, minorBands),
    ];
  }),
  spec("dotted-grid", "grid", { size: 32, look: 7 }, ({ size: s }) => {
    const w = px(s * 0.04);
    const r = half(Math.max(w * 1.75, s * 0.09));
    const lines = [
      ["a", w],
      [null, s - w],
    ] as const;
    // Dots sit on the line crossings at (w / 2, w / 2) of every cell.
    const o = (s + w) / 2;
    return [
      radial(disc("b", r), s / 2, s / 2, s, s, { x: o, y: o }),
      tileBands(90, lines, s, s),
      tileBands(180, lines, s, s),
    ];
  }),
  spec("crosshatch", "grid", { size: 24, look: 2 }, ({ size: s }) => {
    const w = Math.max(1, s * 0.06);
    return [diagonal("a", 45, s, w), diagonal("a", 135, s, w)];
  }),
  spec("bricks", "grid", { size: 48, look: 5 }, ({ size: s }) => {
    const h = Math.round(s / 2);
    const m = px(s * 0.05);
    return [
      tileBands(
        180,
        [
          ["a", m],
          [null, h - m],
          ["a", m],
          [null, h - m],
        ],
        s,
        2 * h,
      ),
      // Joints start below the bed joints, so nothing is painted twice.
      rect("a", m, h - m, s, 2 * h, 0, m),
      rect("a", m, h - m, s, 2 * h, s / 2, h + m),
    ];
  }),
  spec("tiles", "grid", { size: 40, look: 3 }, ({ size: s }) => {
    const g = px(s * 0.08);
    const q = s - g;
    const t = 2 * s;
    return [
      rect("a", q, q, t, t, g / 2, g / 2),
      rect("a", q, q, t, t, s + g / 2, s + g / 2),
      rect("b", q, q, t, t, s + g / 2, g / 2),
      rect("b", q, q, t, t, g / 2, s + g / 2),
    ];
  }),

  // Stripes -----------------------------------------------------------------
  spec(
    "stripes",
    "stripes",
    { rotatable: true, size: 32, angle: 45, look: 1 },
    ({ size: s, angle }) => {
      const w = Math.round(s / 2);
      return [
        stripes(angle, [
          ["a", w],
          [null, s - w],
        ]),
      ];
    },
  ),
  spec(
    "candy",
    "stripes",
    { rotatable: true, size: 40, angle: 135, look: 5 },
    ({ size: s, angle }) => {
      const gap = px(s * 0.1);
      const w = (s - 2 * gap) / 2;
      return [
        stripes(angle, [
          ["a", w],
          [null, gap],
          ["b", w],
          [null, gap],
        ]),
      ];
    },
  ),
  spec(
    "pinstripes",
    "stripes",
    { rotatable: true, size: 16, angle: 90, look: 6 },
    ({ size: s, angle }) => {
      const w = px(s * 0.08);
      return [
        stripes(angle, [
          ["a", w],
          [null, s - w],
        ]),
      ];
    },
  ),
  spec(
    "tricolor",
    "stripes",
    { rotatable: true, size: 48, angle: 0, look: 2 },
    ({ size: s, angle }) => {
      const w = s / 3;
      return [
        stripes(angle, [
          ["a", w],
          ["b", w],
          [null, w],
        ]),
      ];
    },
  ),
  spec(
    "gingham",
    "stripes",
    { rotatable: true, size: 24, angle: 0, look: 5 },
    ({ size: s, angle }) => {
      const w = Math.round(s / 2);
      const bands = [
        ["a", w, 0.5],
        [null, s - w],
      ] as const;
      return [stripes(angle, bands), stripes(angle + 90, bands)];
    },
  ),
  spec(
    "plaid",
    "stripes",
    { rotatable: true, size: 40, angle: 0, look: 3 },
    ({ size: s, angle }) => {
      const u = s / 10;
      const bands = [
        ["a", 6 * u, 0.5],
        [null, 3 * u],
        ["b", u, 0.8],
        [null, u],
        ["b", u, 0.8],
        [null, 3 * u],
        ["a", 2 * u, 0.3],
        [null, 3 * u],
      ] as const;
      return [stripes(angle, bands), stripes(angle + 90, bands)];
    },
  ),
  spec(
    "barcode",
    "stripes",
    { rotatable: true, size: 32, angle: 90, look: 6 },
    ({ size: s, angle }) => {
      // 4 cycles of irregular widths, in 1/16 of the size (sum 64 = 4 s).
      const pattern = [
        2, 1, 1, 2, 4, 1, 1, 3, 3, 1, 1, 2, 2, 1, 1, 4, 1, 2, 3, 1, 2, 2, 1, 3, 4, 1, 1, 2, 2, 1, 1,
        2,
      ];
      const u = s / 16;
      const bands = pattern.map((n, i) => [i % 2 === 0 ? "a" : null, n * u] as const);
      return [stripes(angle, bands)];
    },
  ),

  // Waves -------------------------------------------------------------------
  spec("ripples", "waves", { size: 24, look: 1 }, ({ size: s }) => {
    const w = px(s * 0.15);
    return [
      {
        image: {
          kind: "repeating-radial",
          at: { x: 50, y: 50, unit: "%" },
          stops: bandStops(
            [
              ["a", w],
              [null, s - w],
            ],
            true,
          ),
        },
      },
    ];
  }),
  spec("sunrise", "waves", { size: 40, look: 2 }, ({ size: s }) => {
    const w = s / 2;
    return [
      {
        image: {
          kind: "repeating-radial",
          at: { x: 50, y: 100, unit: "%" },
          stops: bandStops(
            [
              ["a", w],
              ["b", w],
            ],
            true,
          ),
        },
      },
    ];
  }),
  spec("wavy-lines", "waves", { size: 32, look: 0 }, ({ size: s }) => {
    // Upper and lower half rings joined at their ends form a sine-like line.
    const t = px(s * 0.1, 2);
    const r = s / 2;
    const tw = 2 * s;
    const th = Math.round(s * 1.25 + t);
    const ring = ringStops([["a", r - t / 2, r + t / 2]]);
    return [radial(ring, s, th, tw, th), radial(ring, s, 0, tw, th, { x: s, y: 0 })];
  }),
  spec("scallops", "waves", { size: 40, look: 3 }, ({ size: s }) => {
    const h = Math.round(s / 2);
    return [
      radial(disc("a", h), s / 2, 0, s, h),
      radial(disc("b", half(h * 0.45)), s / 2, 0, s, h),
    ];
  }),
  spec("scales", "waves", { size: 40, look: 4 }, ({ size: s }) => {
    const h = Math.round(s / 2);
    const t = px(s * 0.05);
    const ring = ringStops([["a", h - t, h]]);
    return [radial(ring, s / 2, h, s, h), radial(ring, s / 2, h, s, h, { x: s / 2, y: h / 2 })];
  }),
  spec("rainbow", "waves", { size: 48, look: 7 }, ({ size: s }) => {
    const r = s / 2;
    const b = r / 5;
    return [
      radial(
        ringStops([
          ["a", half(b * 2), half(b * 3)],
          ["b", half(b * 3), half(b * 4)],
          ["a", half(b * 4), half(r - 1)],
        ]),
        s / 2,
        r,
        s,
        r,
      ),
    ];
  }),

  // Geometric ---------------------------------------------------------------
  spec("checkerboard", "geometric", { size: 24, look: 6 }, ({ size: s }) => [
    {
      image: {
        kind: "conic",
        from: 0,
        at: { x: s, y: s },
        stops: [
          { ink: "a", at: 90 },
          { ink: null, at: 180 },
          { ink: "a", at: 270 },
          { ink: null, at: 360 },
        ],
      },
      tile: { w: 2 * s, h: 2 * s },
    },
  ]),
  spec("diamonds", "geometric", { size: 40, look: 7 }, ({ size: s }) => [
    cornerTriangle("a", 45, s),
    cornerTriangle("a", 135, s),
    cornerTriangle("a", 225, s),
    cornerTriangle("a", 315, s),
  ]),
  spec("argyle", "geometric", { size: 56, look: 5 }, ({ size: s }) => {
    const w = Math.max(1, s * 0.03);
    return [
      diagonal("b", 45, s, w),
      diagonal("b", 135, s, w),
      cornerTriangle("a", 45, s),
      cornerTriangle("a", 135, s),
      cornerTriangle("a", 225, s),
      cornerTriangle("a", 315, s),
    ];
  }),
  spec("zigzag", "geometric", { size: 32, look: 1 }, ({ size: s }) => zigzagLayers("a", s)),
  spec("chevron", "geometric", { size: 48, look: 2 }, ({ size: s }) => [
    ...zigzagLayers("b", s, s / 4),
    ...zigzagLayers("a", s),
  ]),
  spec("triangles", "geometric", { size: 32, look: 4 }, ({ size: s }) => [
    {
      image: {
        kind: "linear",
        angle: 45,
        unit: "%",
        stops: diagonalEdge("a", 50, s),
      },
      tile: { w: s, h: s },
    },
  ]),
  spec("pinwheel", "geometric", { size: 40, look: 0 }, ({ size: s }) => {
    // Four blades, each a corner triangle moved to a cell edge midpoint.
    const h = s / 2;
    return [
      cornerTriangle("a", 135, s, { x: h, y: 0 }),
      cornerTriangle("a", 225, s, { x: 0, y: h }),
      cornerTriangle("a", 315, s, { x: h, y: 0 }),
      cornerTriangle("a", 45, s, { x: 0, y: h }),
    ];
  }),
  spec("crosses", "geometric", { size: 32, look: 6 }, ({ size: s }) => {
    const arm = px(s * 0.5);
    const w = px(s * 0.14);
    const a = (s - arm) / 2;
    const b = (s - w) / 2;
    // The vertical arm is split around the horizontal one, so nothing is painted twice.
    return [
      rect("a", arm, w, s, s, a, b),
      rect("a", w, b - a, s, s, b, a),
      rect("a", w, b - a, s, s, b, b + w),
    ];
  }),
  spec("squares", "geometric", { size: 32, look: 3 }, ({ size: s }) => {
    const q = px(s * 0.5);
    const o = (s - q) / 2;
    return [rect("a", q, q, s, s, o, o)];
  }),
];

export type CssPatternId = string;

/** Ids in library order (for the tool's enum). */
export const CSS_PATTERN_IDS = CSS_PATTERNS.map((p) => p.id) as [string, ...string[]];

const BY_ID = new Map(CSS_PATTERNS.map((p) => [p.id, p]));

export function getCssPattern(id: string): PatternSpec | undefined {
  return BY_ID.get(id);
}

/** Whether the pattern paints anything with the accent colour. */
export function patternUsesAccent(spec: PatternSpec): boolean {
  return spec
    .layers({ size: spec.size, angle: spec.angle })
    .some((l) => l.image.stops.some((s) => s.ink === "b"));
}
