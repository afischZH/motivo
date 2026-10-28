/**
 * M4b-AP04: Screenshot beautifier (docs/TOOLS.md K6). The user's screenshot
 * (PNG, JPG, WebP or sanitised SVG; local only) on a background, with
 * padding, rounded corners, a layered soft shadow, an optional border and
 * a self-drawn window or browser bar. Without upload a self-drawn
 * placeholder stands in, so presets, thumbnails and snapshots work.
 *
 * Backgrounds: a solid colour, a linear gradient (CSS gradient engine) or
 * a preset of another Musterli background tool, rendered through that
 * tool's own `render` with this design's seed and size (one render path,
 * the same picture the tool itself would draw). The picker lists the
 * presets of `BACKDROP_TOOLS` grouped by tool, so new presets of those
 * tools appear here without code.
 *
 * M4b-AP07: website mockups. `device` puts the screenshot on a self-drawn
 * laptop, desktop monitor, tablet or phone, or on a responsive set of two
 * to four of them (engine `mockupScene`). One screenshot is enough: every
 * device without its own upload shows it, cropped to its screen from the
 * top. The live view (`liveView`) shows the entered https address in
 * sandboxed frames inside the devices and turns a screen capture of them
 * into the uploads; it is a local param like the uploads and the address.
 */
import {
  SCREENSHOT_ALIGNS,
  SCREENSHOT_FRAMES,
  SCREENSHOT_PADDING_MAX,
  SCREENSHOT_THEMES,
  SCREENSHOT_URL_MAX,
  MOCKUP_ARRANGEMENTS,
  MOCKUP_BAR_DEVICES,
  MOCKUP_CAMERAS,
  MOCKUP_FINISHES,
  cssGradient,
  formatNumber,
  mockupScene,
  randomPalette,
  screenshotScene,
  svgDocument,
  type MockupDevice,
  type MockupScene,
  type ScreenshotScene,
  type ScreenshotImage,
} from "@musterli/engine";
import * as z from "zod";
import {
  HEX_COLOR_PATTERN,
  PALETTE_MAX,
  PALETTE_MIN,
  SCREENSHOT_ASSET_RASTER_MAX_EDGE,
  colorSchema,
  paletteSchema,
  screenshotAssetSchema,
} from "../common";
import { fitPalette, mapBrandPalette } from "../brand-palette";
import { keepLocked, parseToolParams } from "../randomize";
import { defineTool } from "../registry";
import { createRenderContext } from "../render";
import { imageAssetHref } from "../svg-asset";
import type {
  AnyToolDefinition,
  CssBox,
  CssOutput,
  LiveFrame,
  OptionGroup,
  Preset,
  RenderContext,
  ToolAdvisory,
  ToolSizePreset,
} from "../types";
import { blobCompositionTool } from "./blob-composition";
import { blurryGradientTool } from "./blurry-gradient";
import { gridPatternsTool } from "./grid-patterns";
import { meshGradientTool } from "./mesh-gradient";
import { optionLabels } from "./shared";
import { starrySkyTool } from "./starry-sky";
import { stripedGradientTool } from "./striped-gradient";
import { svgWavesTool } from "./svg-waves";

const ID = "screenshot-beautifier";

export const SCREENSHOT_BACKGROUND_TYPES = ["solid", "gradient", "musterli"] as const;
export const SCREENSHOT_BACKDROP_COLORS = ["preset", "palette"] as const;

/** Devices of a responsive set (two to four), by the `device` value that picks it. */
export const MOCKUP_SETS = {
  responsive: ["desktop", "laptop", "tablet", "phone"],
  "desktop-tablet-phone": ["desktop", "tablet", "phone"],
  "laptop-tablet-phone": ["laptop", "tablet", "phone"],
  "desktop-phone": ["desktop", "phone"],
  "laptop-phone": ["laptop", "phone"],
  "tablet-phone": ["tablet", "phone"],
} as const satisfies Record<string, readonly MockupDevice[]>;
export type MockupSet = keyof typeof MOCKUP_SETS;
export const MOCKUP_SET_IDS = Object.keys(MOCKUP_SETS) as [MockupSet, ...MockupSet[]];

/**
 * `none`: the plain screenshot (with optional window bar); then single
 * devices and responsive sets. One param, so share links stay short.
 */
export const SCREENSHOT_DEVICES = [
  "none",
  "laptop",
  "desktop",
  "tablet",
  "phone",
  ...MOCKUP_SET_IDS,
] as const;
export type ScreenshotDevice = (typeof SCREENSHOT_DEVICES)[number];

/** Whether a `device` value is a responsive set. */
export const isMockupSet = (device: string): device is MockupSet =>
  Object.prototype.hasOwnProperty.call(MOCKUP_SETS, device);

/**
 * Background tools whose presets the picker offers. Each renders SVG from
 * params plus the render context alone (no uploads, no image input).
 */
export const BACKDROP_TOOLS: readonly AnyToolDefinition[] = [
  meshGradientTool,
  blurryGradientTool,
  stripedGradientTool,
  svgWavesTool,
  blobCompositionTool,
  starrySkyTool,
  gridPatternsTool,
];

interface Backdrop {
  readonly id: string;
  readonly tool: AnyToolDefinition;
  readonly preset: Preset<unknown>;
}

/** Every backdrop as `<tool id>/<preset id>` (stable: preset ids never change). */
export const BACKDROPS: readonly Backdrop[] = BACKDROP_TOOLS.flatMap((tool) =>
  tool.presets.map((preset) => ({ id: `${tool.id}/${preset.id}`, tool, preset })),
);

const BACKDROP_IDS = BACKDROPS.map((b) => b.id) as [string, ...string[]];
const BACKDROP_BY_ID = new Map(BACKDROPS.map((b) => [b.id, b]));

/** Text of the address bar until the user types their own. */
export const SCREENSHOT_DEFAULT_URL = "musterli.app";
/** Accent of the placeholder screenshot. */
const PLACEHOLDER_ACCENT = "#6366f1";

const schema = z.object({
  /** The user's screenshot; `null` = the placeholder. Local only. */
  screenshot: screenshotAssetSchema.nullable(),
  align: z.enum(SCREENSHOT_ALIGNS),
  /** Space around the window in percent of the shorter canvas edge. */
  padding: z.number().min(0).max(SCREENSHOT_PADDING_MAX),
  frame: z.enum(SCREENSHOT_FRAMES),
  theme: z.enum(SCREENSHOT_THEMES),
  /** Address (browser bar) or title (window bar). Local only. */
  url: z.string().max(SCREENSHOT_URL_MAX),
  radius: z.int().min(0).max(64),
  shadow: z.int().min(0).max(100),
  shadowColor: colorSchema,
  border: z.int().min(0).max(32),
  borderColor: colorSchema,
  borderOpacity: z.int().min(0).max(100),
  highlight: z.boolean(),
  backgroundType: z.enum(SCREENSHOT_BACKGROUND_TYPES),
  backdrop: z.enum(BACKDROP_IDS),
  backdropColors: z.enum(SCREENSHOT_BACKDROP_COLORS),
  palette: paletteSchema,
  gradientAngle: z.number().min(0).max(360),
  backgroundColor: colorSchema,
  /** M4b-AP07: the plain screenshot or a device mockup. */
  device: z.enum(SCREENSHOT_DEVICES),
  layout: z.enum(MOCKUP_ARRANGEMENTS),
  finish: z.enum(MOCKUP_FINISHES),
  camera: z.enum(MOCKUP_CAMERAS),
  /** Own screenshots for tablet and phone in a responsive set. Local only. */
  screenshotTablet: screenshotAssetSchema.nullable(),
  screenshotPhone: screenshotAssetSchema.nullable(),
  /** Shows the address live inside the devices (editor only). Local only. */
  live: z.boolean(),
});

export type ScreenshotBeautifierParams = z.output<typeof schema>;

const defaults: ScreenshotBeautifierParams = {
  screenshot: null,
  align: "center",
  padding: 9,
  frame: "browser",
  theme: "dark",
  url: SCREENSHOT_DEFAULT_URL,
  radius: 14,
  shadow: 60,
  shadowColor: "#0b1020",
  border: 0,
  borderColor: "#ffffff",
  borderOpacity: 30,
  highlight: true,
  backgroundType: "musterli",
  backdrop: "mesh-gradient/nebula",
  backdropColors: "preset",
  palette: ["#1e1b4b", "#7c3aed", "#ec4899", "#38bdf8"],
  gradientAngle: 135,
  backgroundColor: "#eef2f7",
  device: "none",
  layout: "cascade",
  finish: "silver",
  camera: "island",
  screenshotTablet: null,
  screenshotPhone: null,
  live: false,
};

/** Params added by M4b-AP07: older links and designs get their defaults. */
const MOCKUP_KEYS = [
  "device",
  "layout",
  "finish",
  "camera",
  "screenshotTablet",
  "screenshotPhone",
  "live",
] as const;

const preset = (
  id: string,
  params: Partial<ScreenshotBeautifierParams>,
): Preset<ScreenshotBeautifierParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Output sizes for launch pages, docs and social posts (public platform sizes). */
const SIZE_PRESETS: readonly ToolSizePreset[] = [
  { id: "wide", width: 1600, height: 900, nameKey: `tools.${ID}.sizes.wide` },
  { id: "product-hunt", width: 1270, height: 760, nameKey: `tools.${ID}.sizes.product-hunt` },
  { id: "linkedin", width: 1200, height: 627, nameKey: `tools.${ID}.sizes.linkedin` },
  { id: "docs", width: 1920, height: 1200, nameKey: `tools.${ID}.sizes.docs` },
  // Mockups: Dribbble shots are 4:3 (1600 × 1200); a square suits Instagram and portfolios.
  { id: "dribbble", width: 1600, height: 1200, nameKey: `tools.${ID}.sizes.dribbble` },
  { id: "square", width: 1600, height: 1600, nameKey: `tools.${ID}.sizes.square` },
];

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------

const isHex = (v: unknown): v is string => typeof v === "string" && HEX_COLOR_PATTERN.test(v);

/**
 * Params of a backdrop preset in this design's palette: the first colour
 * becomes the backdrop tool's background (when it has an opaque one), the
 * rest go through the generic brand palette mapping. Falls back to the
 * preset's own colours when the result does not pass that tool's schema.
 */
export function backdropParams(
  backdrop: Backdrop,
  palette: readonly string[] | null,
): Record<string, unknown> {
  const base = backdrop.preset.params as Record<string, unknown>;
  if (!palette) return base;
  const hasBackground = isHex(base.background);
  const colors = hasBackground && palette.length > PALETTE_MIN ? palette.slice(1) : palette;
  const mapped = mapBrandPalette(backdrop.tool, base, colors);
  if (hasBackground) mapped.background = palette[0];
  const parsed = parseToolParams(backdrop.tool, mapped);
  return parsed.success ? (parsed.data as Record<string, unknown>) : base;
}

/** Recent backdrop renders (dragging a slider must not re-render a mesh each frame). */
const backdropCache = new Map<string, string>();
const BACKDROP_CACHE_ENTRIES = 12;

/** SVG of a backdrop through its tool's own render path. Pure (the cache is keyed by every input). */
export function backdropSvg(
  backdrop: Backdrop,
  palette: readonly string[] | null,
  seed: number,
  width: number,
  height: number,
): string {
  const key = `${backdrop.id}|${palette ? palette.join(",") : "-"}|${seed}|${width}x${height}`;
  const hit = backdropCache.get(key);
  if (hit !== undefined) {
    backdropCache.delete(key);
    backdropCache.set(key, hit);
    return hit;
  }
  const renderer = backdrop.tool.render;
  if (renderer.kind !== "svg") return "";
  const svg = renderer.render(
    backdropParams(backdrop, palette) as never,
    createRenderContext(seed, { width, height }),
  );
  backdropCache.set(key, svg);
  if (backdropCache.size > BACKDROP_CACHE_ENTRIES) {
    const oldest = backdropCache.keys().next().value;
    if (oldest !== undefined) backdropCache.delete(oldest);
  }
  return svg;
}

const backdropOf = (p: ScreenshotBeautifierParams): Backdrop =>
  BACKDROP_BY_ID.get(p.backdrop) ?? (BACKDROPS[0] as Backdrop);

/** The background markup of a design: a rect or a nested `<svg>`. */
export function backgroundMarkup(
  p: ScreenshotBeautifierParams,
  seed: number,
  width: number,
  height: number,
): string {
  if (p.backgroundType === "solid") {
    return `<rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${p.backgroundColor}"/>`;
  }
  if (p.backgroundType === "gradient") {
    return cssGradient({
      type: "linear",
      colors: p.palette,
      angle: p.gradientAngle,
      centerX: 50,
      centerY: 50,
      shape: "ellipse",
      interpolation: "oklch",
      hue: "shorter",
      easing: "linear",
      steps: 0,
      loop: false,
      width,
      height,
    }).previewSvg;
  }
  return backdropSvg(
    backdropOf(p),
    p.backdropColors === "palette" ? p.palette : null,
    seed,
    width,
    height,
  );
}

type ScreenshotAsset = NonNullable<ScreenshotBeautifierParams["screenshot"]>;

/** The screenshot as an engine image; `undefined` for the placeholder or a rejected SVG. */
function screenshotImage(p: ScreenshotBeautifierParams): ScreenshotImage | undefined {
  return assetImage(p.screenshot);
}

function assetImage(asset: ScreenshotAsset | null): ScreenshotImage | undefined {
  if (!asset) return undefined;
  const href = imageAssetHref(asset);
  if (!href || !(asset.width > 0 && asset.height > 0)) return undefined;
  return { href, width: asset.width, height: asset.height };
}

/** Small memo: a multi-megabyte data URI is checked once per picture, not per render. */
const cssHrefs = new Map<string, string>();
/** Three uploads (mockups) plus one spare. */
const CSS_HREF_ENTRIES = 4;
/** The picture's data URI for CSS `url("…")`; valid ones contain no quotes, backslashes or newlines. */
function cssHref(href: string): string {
  const hit = cssHrefs.get(href);
  if (hit !== undefined) return hit;
  const safe = /["\\\n\r]/.test(href) ? href.replace(/["\\\n\r]/g, "") : href;
  cssHrefs.set(href, safe);
  if (cssHrefs.size > CSS_HREF_ENTRIES) {
    const oldest = cssHrefs.keys().next().value;
    if (oldest !== undefined) cssHrefs.delete(oldest);
  }
  return safe;
}

/**
 * Preview and exports. `previewSvg` is the finished picture: the exports
 * (PNG, JPG, WebP, SVG) and thumbnails elsewhere use it. The editor preview
 * shows the same scene in two layers: the stage (everything but the
 * picture) as a CSS background, and the picture as an element on top. The
 * browser decodes a multi-megabyte screenshot once for the element instead
 * of parsing a new SVG document around it on every change (about 150 ms for
 * a 4K screenshot in Chromium, M4b-AP04). Position, size, corner radius and
 * light edge match the SVG exactly; "preview == PNG" checks it in E2E.
 */
function sceneOutput(scene: ScreenshotScene, image: ScreenshotImage | undefined): CssOutput {
  const stage =
    `background-image: url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(scene.stageSvg)}");\n` +
    "background-size: 100% 100%;\nbackground-repeat: no-repeat;";
  const out: CssOutput = { css: stage, previewSvg: scene.svg };
  const layer = scene.picture;
  if (!layer || !image) return out;
  const { window: win, barHeight, radius, highlight, highlightOpacity } = layer;
  const n = (v: number) => formatNumber(v, 2);
  const decls = [
    `background-image: url("${cssHref(image.href)}");`,
    "background-repeat: no-repeat;",
    `background-position: 0 ${n(barHeight)}px;`,
    `background-size: ${n(win.width)}px ${n(win.height - barHeight)}px;`,
    `border-radius: ${n(radius)}px;`,
  ];
  if (highlight > 0) {
    decls.push(`box-shadow: inset 0 0 0 ${n(highlight)}px rgb(255 255 255 / ${highlightOpacity});`);
  }
  out.element = { x: win.x, y: win.y, width: win.width, height: win.height, css: decls.join("\n") };
  return out;
}

// ---------------------------------------------------------------------------
// Mockups (M4b-AP07)
// ---------------------------------------------------------------------------

/** The devices of a design, or `null` for the plain screenshot. */
export function mockupDevices(p: ScreenshotBeautifierParams): readonly MockupDevice[] | null {
  if (p.device === "none") return null;
  if (isMockupSet(p.device)) return MOCKUP_SETS[p.device];
  return [p.device];
}

/** Image param that holds the picture of a device class. */
export type ScreenshotParam = "screenshot" | "screenshotTablet" | "screenshotPhone";

/** Where each device looks for its picture first, then the fallbacks in order. */
const PICTURE_ORDER: Readonly<
  Record<MockupDevice, readonly [ScreenshotParam, ScreenshotParam, ScreenshotParam]>
> = {
  desktop: ["screenshot", "screenshotTablet", "screenshotPhone"],
  laptop: ["screenshot", "screenshotTablet", "screenshotPhone"],
  tablet: ["screenshotTablet", "screenshot", "screenshotPhone"],
  phone: ["screenshotPhone", "screenshotTablet", "screenshot"],
};

/**
 * The param a device's own picture belongs in. A single device always uses
 * the main upload; in a set, tablet and phone have their own (optional).
 */
export function deviceParam(p: ScreenshotBeautifierParams, device: MockupDevice): ScreenshotParam {
  return isMockupSet(p.device) ? PICTURE_ORDER[device][0] : "screenshot";
}

/**
 * The picture each device shows: its own upload, else any other one (one
 * screenshot is enough), else none (the placeholder website).
 */
export function mockupImages(
  p: ScreenshotBeautifierParams,
  devices: readonly MockupDevice[],
): Partial<Record<MockupDevice, ScreenshotImage>> {
  const out: Partial<Record<MockupDevice, ScreenshotImage>> = {};
  for (const device of devices) {
    const order: readonly ScreenshotParam[] = isMockupSet(p.device)
      ? PICTURE_ORDER[device]
      : ["screenshot"];
    for (const key of order) {
      const image = assetImage(p[key]);
      if (image) {
        out[device] = image;
        break;
      }
    }
  }
  return out;
}

/** `border-radius` from top left, top right, bottom right, bottom left. */
const radiiCss = (r: readonly number[]): string =>
  r.every((v) => v === r[0])
    ? `${formatNumber(r[0] ?? 0, 2)}px`
    : r.map((v) => `${formatNumber(v, 2)}px`).join(" ");

const svgBackground = (doc: string): string =>
  `background-image: url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}");\n` +
  "background-size: 100% 100%;\nbackground-repeat: no-repeat;";

/**
 * Preview and exports of a mockup. Without uploads the stage is the whole
 * picture. With uploads the stage holds the background and the first
 * device; a transparent element over the whole canvas carries the rest in
 * paint order as boxes: each picture as a box of its own (the browser
 * decodes it once), each run of vector parts in between as a full-size SVG
 * box. Devices in front therefore cover the pictures behind them exactly
 * as in the SVG ("preview == PNG" in E2E).
 */
function mockupOutput(scene: MockupScene, width: number, height: number): CssOutput {
  const [first, ...rest] = scene.layers;
  if (!rest.some((l) => l.kind === "picture")) {
    return { css: svgBackground(scene.svg), previewSvg: scene.svg };
  }
  const defs = `<defs>${scene.defs}</defs>`;
  const doc = (body: string) => svgDocument(width, height, `${defs}${body}`);
  const stage = first?.kind === "svg" ? first.body : "";
  const n = (v: number) => formatNumber(v, 2);
  const content: CssBox[] = rest.map((l) =>
    l.kind === "svg"
      ? { x: 0, y: 0, width, height, css: svgBackground(doc(l.body)) }
      : {
          x: l.box.x,
          y: l.box.y,
          width: l.box.width,
          height: l.box.height,
          css: [
            `background-image: url("${cssHref(l.href)}");`,
            "background-repeat: no-repeat;",
            `background-position: ${n(l.image.x)}px ${n(l.image.y)}px;`,
            `background-size: ${n(l.image.width)}px ${n(l.image.height)}px;`,
            `border-radius: ${radiiCss(l.radii)};`,
          ].join("\n"),
        },
  );
  return {
    css: svgBackground(doc(stage)),
    previewSvg: scene.svg,
    element: { x: 0, y: 0, width, height, css: "background: transparent;", content },
  };
}

function renderMockup(
  p: ScreenshotBeautifierParams,
  ctx: RenderContext,
  devices: readonly MockupDevice[],
): MockupScene {
  return mockupScene({
    width: ctx.width,
    height: ctx.height,
    padding: p.padding,
    align: p.align,
    devices,
    arrangement: p.layout,
    backgroundSvg: backgroundMarkup(p, ctx.seed, ctx.width, ctx.height),
    images: mockupImages(p, devices),
    finish: p.finish,
    camera: p.camera,
    frame: p.frame,
    theme: p.theme,
    url: p.url,
    shadow: p.shadow,
    shadowColor: p.shadowColor,
    accent: PLACEHOLDER_ACCENT,
  });
}

/**
 * The address as an https URL for the live view, or `null`. Display text
 * becomes `https://` plus the text; anything but https, credentials in the
 * URL or a host without a dot (except `localhost`) is refused.
 */
export function liveUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  // No `URL` here (no DOM types in the registry); a strict pattern does: no credentials, no odd characters.
  const m = LIVE_URL.exec(withScheme);
  if (!m) return null;
  const host = (m[1] ?? "").toLowerCase();
  if (!host.includes(".") && host !== "localhost") return null;
  if (host.split(".").some((label) => !label || label.startsWith("-") || label.endsWith("-"))) {
    return null;
  }
  return `https://${host}${m[2] ?? ""}${m[3] || "/"}`;
}

/** https, host of letters, digits, dots and hyphens, optional port, then path, query, fragment. */
const LIVE_URL = /^https:\/\/([a-z0-9.-]{1,253})(:\d{1,5})?([/?#][^\s"'<>\\^`{|}]*)?$/i;

/** Whether the address reads like a web address (gentle check: it is display text). */
export function looksLikeAddress(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return liveUrl(t.replace(/^http:\/\//i, "https://")) !== null;
}

/**
 * Live frames, back to front like their devices. Each image param receives
 * the view of the first device that uses it (the larger viewport); a second
 * device on the same param (desktop and laptop) shows the page but is not
 * captured (`param` empty).
 */
export function liveFrames(p: ScreenshotBeautifierParams, ctx: RenderContext): LiveFrame[] {
  const devices = mockupDevices(p);
  const url = p.live ? liveUrl(p.url) : null;
  if (!devices || !url) return [];
  const scene = renderMockup(p, ctx, devices);
  // `devices` follows MOCKUP_DEVICES (desktop before laptop), not paint order.
  const owner = new Map<ScreenshotParam, MockupDevice>();
  for (const device of devices) {
    const param = deviceParam(p, device);
    if (!owner.has(param)) owner.set(param, device);
  }
  return scene.screens.map((s) => {
    const param = deviceParam(p, s.device);
    return {
      id: s.device,
      url,
      x: s.rect.x,
      y: s.rect.y,
      width: s.rect.width,
      height: s.rect.height,
      radii: s.radii,
      viewportWidth: s.viewport.width,
      viewportHeight: s.viewport.height,
      occluders: s.occluders,
      param: owner.get(param) === s.device ? param : "",
      titleKey: `tools.${ID}.params.device.options.${s.device}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const BACKDROP_GROUPS: readonly OptionGroup[] = BACKDROP_TOOLS.map((tool) => ({
  id: tool.id,
  labelKey: `tools.${tool.id}.name`,
  values: BACKDROPS.filter((b) => b.tool === tool).map((b) => b.id),
}));

const BACKDROP_LABELS = Object.fromEntries(BACKDROPS.map((b) => [b.id, b.preset.nameKey]));

/** Size of the backdrop thumbnails in the picker (rendered small, shown at about 56 px). */
const THUMB = { width: 96, height: 64 } as const;

const isType =
  (type: ScreenshotBeautifierParams["backgroundType"]) => (p: ScreenshotBeautifierParams) =>
    p.backgroundType === type;
const usesPalette = (p: ScreenshotBeautifierParams) =>
  p.backgroundType === "gradient" ||
  (p.backgroundType === "musterli" && p.backdropColors === "palette");

const isMockup = (p: ScreenshotBeautifierParams) => p.device !== "none";
const isPlain = (p: ScreenshotBeautifierParams) => p.device === "none";
const isSet = (p: ScreenshotBeautifierParams) => isMockupSet(p.device);
const hasDevice = (device: MockupDevice) => (p: ScreenshotBeautifierParams) =>
  mockupDevices(p)?.includes(device) ?? false;
/** The bar (and so the address) shows on plain screenshots and on desktop and laptop screens. */
const showsBar = (p: ScreenshotBeautifierParams) =>
  mockupDevices(p)?.some((d) => MOCKUP_BAR_DEVICES.has(d)) ?? true;

/**
 * Params added later stay valid (M4b-AP07 adds the mockup params with their
 * defaults); an unknown backdrop (a preset removed upstream) falls back.
 */
function migrateParams(raw: Readonly<Record<string, unknown>>): unknown {
  let out: Record<string, unknown> | null = null;
  for (const key of MOCKUP_KEYS) {
    if (!(key in raw)) {
      out ??= { ...raw };
      out[key] = defaults[key];
    }
  }
  const backdrop = raw.backdrop;
  if (typeof backdrop === "string" && !BACKDROP_BY_ID.has(backdrop)) {
    out ??= { ...raw };
    out.backdrop = defaults.backdrop;
  }
  return out ?? raw;
}

export const screenshotBeautifierTool = defineTool({
  id: ID,
  version: 1,
  category: ["social", "backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1600, height: 900 },
  sizePresets: SIZE_PRESETS,
  // The pictures, the address typed for them and the live view never leave the device.
  localParams: ["screenshot", "url", "screenshotTablet", "screenshotPhone", "live"],
  migrateParams,
  presets: [
    preset("aurora", {}),
    preset("clean", {
      backgroundType: "solid",
      backgroundColor: "#e8edf4",
      frame: "window",
      theme: "light",
      radius: 12,
      shadow: 35,
      shadowColor: "#334155",
      highlight: false,
      padding: 10,
    }),
    preset("sunset", {
      backgroundType: "gradient",
      palette: ["#f97316", "#ec4899", "#8b5cf6"],
      gradientAngle: 135,
      frame: "browser",
      theme: "light",
      radius: 16,
      shadow: 55,
      shadowColor: "#4c0519",
      border: 12,
      borderColor: "#ffffff",
      borderOpacity: 35,
      highlight: false,
    }),
    preset("ocean", {
      backdrop: "blurry-gradient/ocean",
      frame: "window",
      theme: "dark",
      radius: 12,
      shadow: 50,
      padding: 11,
    }),
    preset("paper", {
      backgroundType: "solid",
      backgroundColor: "#ffffff",
      frame: "none",
      theme: "light",
      radius: 8,
      shadow: 22,
      shadowColor: "#475569",
      border: 1,
      borderColor: "#cbd5e1",
      borderOpacity: 100,
      highlight: false,
      padding: 8,
    }),
    preset("waves", {
      backdrop: "svg-waves/tide",
      frame: "browser",
      theme: "light",
      align: "bottom",
      padding: 7,
      radius: 18,
      shadow: 45,
      shadowColor: "#03045e",
      highlight: false,
    }),
    preset("night-sky", {
      backdrop: "starry-sky/midnight",
      frame: "window",
      theme: "dark",
      radius: 10,
      shadow: 70,
      shadowColor: "#000000",
      border: 6,
      borderColor: "#ffffff",
      borderOpacity: 12,
    }),
    // M4b-AP07: website mockups.
    preset("mockup-responsive", {
      device: "responsive",
      layout: "cascade",
      finish: "silver",
      theme: "light",
      shadow: 55,
      padding: 7,
    }),
    preset("mockup-laptop", {
      device: "laptop",
      finish: "graphite",
      backgroundType: "solid",
      backgroundColor: "#e9edf3",
      theme: "light",
      shadow: 45,
      shadowColor: "#334155",
      padding: 10,
    }),
    preset("mockup-phone", {
      device: "phone",
      finish: "white",
      camera: "island",
      backgroundType: "gradient",
      palette: ["#22d3ee", "#6366f1", "#a855f7"],
      gradientAngle: 150,
      theme: "light",
      shadow: 60,
      shadowColor: "#1e1b4b",
      padding: 8,
    }),
    preset("mockup-desktop", {
      device: "desktop",
      finish: "silver",
      backdrop: "blurry-gradient/ocean",
      theme: "dark",
      shadow: 50,
      padding: 9,
    }),
    preset("mockup-row", {
      device: "laptop-tablet-phone",
      layout: "row",
      finish: "graphite",
      backdrop: "starry-sky/midnight",
      theme: "dark",
      shadow: 70,
      shadowColor: "#000000",
      padding: 8,
    }),
    preset("mockup-focus", {
      device: "responsive",
      layout: "focus",
      finish: "white",
      camera: "notch",
      backgroundType: "solid",
      backgroundColor: "#f1f5f9",
      frame: "window",
      theme: "light",
      shadow: 40,
      shadowColor: "#475569",
      padding: 6,
    }),
  ],
  controls: {
    groups: [
      { id: "device", labelKey: `tools.${ID}.groups.device` },
      { id: "screenshot", labelKey: `tools.${ID}.groups.screenshot` },
      { id: "frame", labelKey: `tools.${ID}.groups.frame` },
      { id: "style", labelKey: `tools.${ID}.groups.style` },
      { id: "background", labelKey: `tools.${ID}.groups.background` },
    ],
    order: [
      "device",
      "layout",
      "finish",
      "camera",
      "screenshot",
      "screenshotTablet",
      "screenshotPhone",
      "padding",
      "align",
      "frame",
      "theme",
      "url",
      "live",
      "radius",
      "shadow",
      "shadowColor",
      "border",
      "borderColor",
      "borderOpacity",
      "highlight",
      "backgroundType",
      "backdrop",
      "backdropColors",
      "palette",
      "gradientAngle",
      "backgroundColor",
    ],
    params: {
      device: {
        group: "device",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "device", SCREENSHOT_DEVICES),
        descriptionKey: `tools.${ID}.params.device.description`,
      },
      layout: {
        group: "device",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "layout", MOCKUP_ARRANGEMENTS),
        visibleWhen: isSet,
      },
      finish: {
        group: "device",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "finish", MOCKUP_FINISHES),
        visibleWhen: isMockup,
      },
      camera: {
        group: "device",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "camera", MOCKUP_CAMERAS),
        visibleWhen: hasDevice("phone"),
      },
      screenshot: {
        group: "screenshot",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.screenshot.description`,
        image: { maxEdge: SCREENSHOT_ASSET_RASTER_MAX_EDGE },
      },
      screenshotTablet: {
        group: "screenshot",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.screenshotTablet.description`,
        // Several upload fields are visible: a paste goes to the main one only.
        image: { maxEdge: SCREENSHOT_ASSET_RASTER_MAX_EDGE, paste: false },
        visibleWhen: (p) => isSet(p) && hasDevice("tablet")(p),
      },
      screenshotPhone: {
        group: "screenshot",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.screenshotPhone.description`,
        image: { maxEdge: SCREENSHOT_ASSET_RASTER_MAX_EDGE, paste: false },
        visibleWhen: (p) => isSet(p) && hasDevice("phone")(p),
      },
      padding: { group: "screenshot", unit: "%", step: 0.5 },
      align: {
        group: "screenshot",
        optionLabelKeys: optionLabels(ID, "align", SCREENSHOT_ALIGNS),
        descriptionKey: `tools.${ID}.params.align.description`,
      },
      frame: {
        group: "frame",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "frame", SCREENSHOT_FRAMES),
        visibleWhen: showsBar,
      },
      theme: {
        group: "frame",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "theme", SCREENSHOT_THEMES),
        descriptionKey: `tools.${ID}.params.theme.description`,
      },
      url: {
        group: "frame",
        lockable: false,
        descriptionKey: `tools.${ID}.params.url.description`,
        visibleWhen: (p) => isMockup(p) || p.frame !== "none",
      },
      live: {
        group: "frame",
        lockable: false,
        descriptionKey: `tools.${ID}.params.live.description`,
        visibleWhen: isMockup,
      },
      radius: { group: "style", unit: "px", visibleWhen: isPlain },
      shadow: { group: "style", unit: "%" },
      shadowColor: { group: "style", visibleWhen: (p) => p.shadow > 0 },
      border: { group: "style", unit: "px", visibleWhen: isPlain },
      borderColor: { group: "style", visibleWhen: (p) => isPlain(p) && p.border > 0 },
      borderOpacity: {
        group: "style",
        unit: "%",
        visibleWhen: (p) => isPlain(p) && p.border > 0,
      },
      highlight: {
        group: "style",
        descriptionKey: `tools.${ID}.params.highlight.description`,
        visibleWhen: isPlain,
      },
      backgroundType: {
        group: "background",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "backgroundType", SCREENSHOT_BACKGROUND_TYPES),
      },
      backdrop: {
        group: "background",
        kind: "thumbnails",
        optionLabelKeys: BACKDROP_LABELS,
        optionGroups: BACKDROP_GROUPS,
        optionPreview(value, params) {
          const b = BACKDROP_BY_ID.get(String(value));
          if (!b) return { css: "" };
          const palette = params.backdropColors === "palette" ? params.palette : null;
          return { svg: backdropSvg(b, palette, 1, THUMB.width, THUMB.height) };
        },
        visibleWhen: isType("musterli"),
      },
      backdropColors: {
        group: "background",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "backdropColors", SCREENSHOT_BACKDROP_COLORS),
        visibleWhen: isType("musterli"),
      },
      palette: { group: "background", visibleWhen: usesPalette },
      gradientAngle: {
        group: "background",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: isType("gradient"),
      },
      backgroundColor: { group: "background", visibleWhen: isType("solid") },
    },
  },
  randomize(rng, current, locks) {
    // A new background only: the screenshot, its frame and its style stay.
    const palette = randomPalette(rng, rng.int(3, 5));
    const next: ScreenshotBeautifierParams = {
      ...current,
      palette,
      gradientAngle: rng.int(0, 71) * 5,
      backdrop: rng.pick(BACKDROP_IDS),
      backgroundColor: randomPalette(rng, 2)[0] ?? current.backgroundColor,
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors) {
    // Brand colours fill the background; shadow and border keep their contrast colours.
    return {
      palette: fitPalette(colors, PALETTE_MIN, PALETTE_MAX),
      backgroundColor: colors[0] ?? defaults.backgroundColor,
      backdropColors: "palette" as const,
    };
  },
  advisories(p) {
    const out: ToolAdvisory[] = [];
    const url = p.url.trim();
    if (p.live && isMockup(p) && !liveUrl(url)) {
      out.push({ id: "live-url", messageKey: `tools.${ID}.advisories.liveUrl` });
    } else if (isMockup(p) && showsBar(p) && p.frame === "browser" && !looksLikeAddress(url)) {
      out.push({ id: "url", messageKey: `tools.${ID}.advisories.url` });
    }
    return out;
  },
  liveView: {
    frames: liveFrames,
    // The captured pictures replace the frames, so the preview shows what the export will be.
    afterCapture: { live: false },
  },
  render: {
    kind: "css",
    render(p, ctx) {
      const devices = mockupDevices(p);
      if (devices) return mockupOutput(renderMockup(p, ctx, devices), ctx.width, ctx.height);
      const image = screenshotImage(p);
      const scene = screenshotScene({
        width: ctx.width,
        height: ctx.height,
        padding: p.padding,
        align: p.align,
        frame: p.frame,
        border: p.border,
        radius: p.radius,
        backgroundSvg: backgroundMarkup(p, ctx.seed, ctx.width, ctx.height),
        image,
        shadow: p.shadow,
        shadowColor: p.shadowColor,
        borderColor: p.borderColor,
        borderOpacity: p.borderOpacity,
        highlight: p.highlight,
        theme: p.theme,
        url: p.url,
        accent: PLACEHOLDER_ACCENT,
      });
      return sceneOutput(scene, image);
    },
  },
  exports: ["png", "jpg", "webp", "svg"],
});
