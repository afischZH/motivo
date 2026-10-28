/**
 * M4c-AP02: Favicon and app icon pack (docs/TOOLS.md L2). A square icon
 * from a letter, a library shape or the user's logo on a solid, gradient or
 * pattern background, plus the "Icon pack (ZIP)" bundle: favicon.ico (16,
 * 32, 48), favicon.svg (light and dark), apple-touch-icon, 192/512 icons, a
 * maskable icon, site.webmanifest and the HTML head tags.
 *
 * Every image of the pack is rendered by `render` with the variant set in
 * the params (one render path); favicon.svg comes from the same engine
 * function with both colour schemes.
 *
 * The logo is a local param: never in share links (the link shows the
 * text instead). SVG logos are sanitised again before every use and only
 * embedded as images (`imageAssetHref`, `recolorSvgAsset`).
 */
import {
  FAVICON_BACKGROUNDS,
  FAVICON_CONTENTS,
  FAVICON_CORNERS,
  FAVICON_FONTS,
  FAVICON_GRADIENTS,
  FAVICON_PADDING_MAX,
  FAVICON_PATTERNS,
  FAVICON_TEXT_MAX,
  FAVICON_VARIANTS,
  SHAPE_IDS,
  contrastRatio,
  escapeXml,
  faviconSvg,
  randomPalette,
  shapePath,
  shapesInPacks,
  svgBase64DataUri,
  type FaviconContent,
  type FaviconOptions,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, imageAssetSchema, paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import { SHAPE_OPTION_LABEL_KEYS, shapePackGroups, shapePreview } from "../shapes";
import { imageAssetHref, recolorSvgAsset, svgAssetFor } from "../svg-asset";
import type { BundleFile, Preset, RenderContext, ToolAdvisory, ToolSizePreset } from "../types";
import { optionLabels } from "./shared";

const ID = "favicon-generator";

const schema = z.object({
  variant: z.enum(FAVICON_VARIANTS),
  content: z.enum(FAVICON_CONTENTS),
  text: z.string().max(FAVICON_TEXT_MAX),
  font: z.enum(FAVICON_FONTS),
  fontWeight: z.int().min(300).max(900),
  textSize: z.int().min(20).max(100),
  shape: z.enum(SHAPE_IDS),
  /** The user's own logo; `null` = the text is shown. Local only. */
  logo: imageAssetSchema.nullable(),
  logoTint: z.boolean(),
  foreground: colorSchema,
  backgroundType: z.enum(FAVICON_BACKGROUNDS),
  backgroundColor: colorSchema,
  gradientColors: paletteSchema,
  gradientType: z.enum(FAVICON_GRADIENTS),
  gradientAngle: z.number().min(0).max(360),
  pattern: z.enum(FAVICON_PATTERNS),
  patternColor: colorSchema,
  patternDensity: z.int().min(2).max(16),
  corner: z.enum(FAVICON_CORNERS),
  radius: z.int().min(0).max(50),
  padding: z.int().min(0).max(FAVICON_PADDING_MAX),
  darkMode: z.boolean(),
  darkForeground: colorSchema,
  darkBackground: colorSchema,
  appName: z.string().max(45),
  shortName: z.string().max(12),
  themeColor: colorSchema,
  appBackground: colorSchema,
});

export type FaviconParams = z.output<typeof schema>;

const defaults: FaviconParams = {
  variant: "standard",
  content: "text",
  text: "M",
  font: "sans",
  fontWeight: 800,
  textSize: 72,
  shape: "star",
  logo: null,
  logoTint: false,
  foreground: "#ffffff",
  backgroundType: "solid",
  backgroundColor: "#4f46e5",
  gradientColors: ["#6366f1", "#ec4899"],
  gradientType: "linear",
  gradientAngle: 135,
  pattern: "dots",
  patternColor: "#818cf8",
  patternDensity: 6,
  corner: "rounded",
  radius: 22,
  padding: 14,
  darkMode: false,
  darkForeground: "#1e1b4b",
  darkBackground: "#c7d2fe",
  appName: "",
  shortName: "",
  themeColor: "#4f46e5",
  appBackground: "#ffffff",
};

const preset = (id: string, params: Partial<FaviconParams>): Preset<FaviconParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Edges of the icon pack (docs/TOOLS.md L2). */
export const FAVICON_ICO_SIZES = [16, 32, 48] as const;
export const APPLE_TOUCH_SIZE = 180;
export const MANIFEST_ICON_SIZES = [192, 512] as const;
/** Edge of `favicon.svg` (its viewBox; browsers scale it). */
const SVG_FILE_EDGE = 512;

const SIZE_PRESETS: readonly ToolSizePreset[] = [
  { id: "icon-512", width: 512, height: 512, nameKey: `tools.${ID}.sizes.icon-512` },
  { id: "icon-1024", width: 1024, height: 1024, nameKey: `tools.${ID}.sizes.icon-1024` },
  { id: "icon-192", width: 192, height: 192, nameKey: `tools.${ID}.sizes.icon-192` },
  { id: "apple-touch", width: 180, height: 180, nameKey: `tools.${ID}.sizes.apple-touch` },
];

/** Shapes the space bar picks from: solid, recognisable silhouettes. */
const RANDOM_SHAPES = shapesInPacks(["basics", "geometric", "stars", "nature", "symbols"]);

/** Data URIs of sanitised or recoloured SVG logos, per (svg, colour). */
const logoUris = new Map<string, string>();
const LOGO_URI_ENTRIES = 8;

function logoUri(svg: string): string {
  let uri = logoUris.get(svg);
  if (uri === undefined) {
    uri = svgBase64DataUri(svg);
    if (logoUris.size >= LOGO_URI_ENTRIES) {
      const oldest = logoUris.keys().next().value;
      if (oldest !== undefined) logoUris.delete(oldest);
    }
    logoUris.set(svg, uri);
  }
  return uri;
}

function textContent(p: FaviconParams): FaviconContent {
  return { kind: "text", text: p.text, font: p.font, weight: p.fontWeight, size: p.textSize };
}

/** The content to draw; a missing or rejected logo falls back to the text. */
function resolveContent(p: FaviconParams): FaviconContent {
  if (p.content === "shape") return { kind: "shape", path: shapePath(p.shape) };
  if (p.content === "text" || p.logo === null) return textContent(p);
  const logo = p.logo;
  const aspect = logo.width / logo.height;
  if (logo.kind === "raster") return { kind: "image", href: logo.href, aspect, tint: p.logoTint };
  if (!p.logoTint) {
    const href = imageAssetHref(logo);
    return href === null ? textContent(p) : { kind: "image", href, aspect, tint: false };
  }
  // Defence in depth: whatever arrives in params is sanitised again (prepared once).
  const clean = svgAssetFor(logo.svg);
  const light = clean && recolorSvgAsset(clean, p.foreground);
  const dark = clean && recolorSvgAsset(clean, p.darkForeground);
  if (!clean || !light || !dark) return textContent(p);
  return { kind: "image", href: logoUri(light), darkHref: logoUri(dark), aspect, tint: false };
}

type EngineVariant = FaviconOptions["variant"];

function engineOptions(
  p: FaviconParams,
  size: { width: number; height: number },
  variant: EngineVariant,
  scheme: FaviconOptions["scheme"],
): FaviconOptions {
  return {
    width: size.width,
    height: size.height,
    variant,
    scheme,
    content: resolveContent(p),
    colors: {
      foreground: p.foreground,
      background: p.backgroundColor,
      darkForeground: p.darkForeground,
      darkBackground: p.darkBackground,
      appBackground: p.appBackground,
    },
    backgroundType: p.backgroundType,
    gradient: { colors: p.gradientColors, type: p.gradientType, angle: p.gradientAngle },
    pattern: { kind: p.pattern, color: p.patternColor, density: p.patternDensity },
    padding: p.padding,
    corner: p.corner,
    radius: p.radius,
  };
}

/** The icon as shown in the preview and the single-file exports. */
export function faviconRender(
  p: FaviconParams,
  ctx: Pick<RenderContext, "width" | "height">,
): string {
  const variant: EngineVariant = p.variant === "dark" ? "standard" : p.variant;
  const scheme = p.variant === "dark" && p.darkMode ? "dark" : "light";
  return faviconSvg(engineOptions(p, ctx, variant, scheme));
}

/** `favicon.svg`: with dark mode both schemes behind `prefers-color-scheme`. */
export function faviconSvgFile(p: FaviconParams): string {
  return faviconSvg(
    engineOptions(
      p,
      { width: SVG_FILE_EDGE, height: SVG_FILE_EDGE },
      "standard",
      p.darkMode ? "adaptive" : "light",
    ),
  );
}

/** App name for the manifest: the name, else the short name, else the text, else "App". */
function appName(p: FaviconParams): string {
  return p.appName.trim() || p.shortName.trim() || p.text.trim() || "App";
}

/** `site.webmanifest` (JSON, pretty printed). */
export function faviconManifest(p: FaviconParams): string {
  const name = appName(p);
  const manifest = {
    name,
    short_name: p.shortName.trim() || name.slice(0, 12),
    icons: [
      ...MANIFEST_ICON_SIZES.map((s) => ({
        src: `/icon-${s}.png`,
        sizes: `${s}x${s}`,
        type: "image/png",
      })),
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    theme_color: p.themeColor.toLowerCase(),
    background_color: p.appBackground.toLowerCase(),
    display: "standalone",
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** The `<head>` tags that wire the pack into a page. */
export function faviconHeadSnippet(p: FaviconParams): string {
  const lines = [
    '<link rel="icon" href="/favicon.ico" sizes="32x32">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ];
  const short = p.shortName.trim();
  if (short !== "") {
    lines.push(`<meta name="apple-mobile-web-app-title" content="${escapeXml(short)}">`);
  }
  // Colours passed the hex schema, so they need no escaping.
  if (p.darkMode) {
    lines.push(
      `<meta name="theme-color" content="${p.themeColor.toLowerCase()}" media="(prefers-color-scheme: light)">`,
      `<meta name="theme-color" content="${p.darkBackground.toLowerCase()}" media="(prefers-color-scheme: dark)">`,
    );
  } else {
    lines.push(`<meta name="theme-color" content="${p.themeColor.toLowerCase()}">`);
  }
  return `${lines.join("\n")}\n`;
}

/** Files of the icon pack in archive order. */
export function iconPackFiles(p: FaviconParams): BundleFile<FaviconParams>[] {
  const standard: FaviconParams = { ...p, variant: "standard" };
  return [
    { kind: "ico", path: "favicon.ico", sizes: FAVICON_ICO_SIZES, params: standard },
    { kind: "text", path: "favicon.svg", text: faviconSvgFile(p) },
    {
      kind: "png",
      path: "apple-touch-icon.png",
      width: APPLE_TOUCH_SIZE,
      height: APPLE_TOUCH_SIZE,
      params: { ...p, variant: "apple" },
    },
    ...MANIFEST_ICON_SIZES.map((s): BundleFile<FaviconParams> => ({
      kind: "png",
      path: `icon-${s}.png`,
      width: s,
      height: s,
      params: standard,
    })),
    {
      kind: "png",
      path: "icon-512-maskable.png",
      width: 512,
      height: 512,
      params: { ...p, variant: "maskable" },
    },
    { kind: "text", path: "site.webmanifest", text: faviconManifest(p) },
    { kind: "text", path: "head-snippet.html", text: faviconHeadSnippet(p) },
  ];
}

/** White and black: one of them always reaches 4.5:1 on any colour. */
const NEUTRALS = ["#ffffff", "#000000"] as const;

/** The candidate with the highest contrast to `background`. */
function bestContrast(background: string, candidates: readonly string[]): string {
  let best = candidates[0] ?? NEUTRALS[0];
  let ratio = -1;
  for (const c of candidates) {
    const r = contrastRatio(background, c);
    if (r > ratio) {
      ratio = r;
      best = c;
    }
  }
  return best;
}

/** A palette colour with at least 4.5:1 contrast, else the better neutral. */
function readableForeground(background: string, palette: readonly string[]): string {
  const fromPalette = palette.filter((c) => contrastRatio(background, c) >= 4.5);
  return fromPalette.length > 0
    ? bestContrast(background, fromPalette)
    : bestContrast(background, NEUTRALS);
}

const showsText = (p: FaviconParams): boolean =>
  p.content === "text" || (p.content === "image" && p.logo === null);
const usesBase = (p: FaviconParams): boolean =>
  p.backgroundType === "solid" || p.backgroundType === "pattern";

/** i18n key of a param help text. */
const describe = (param: keyof FaviconParams): string => `tools.${ID}.params.${param}.description`;

const GROUPS = {
  view: { id: "view", labelKey: `tools.${ID}.groups.view` },
  content: { id: "content", labelKey: `tools.${ID}.groups.content` },
  background: { id: "background", labelKey: `tools.${ID}.groups.background` },
  form: { id: "form", labelKey: `tools.${ID}.groups.form` },
  dark: { id: "dark", labelKey: `tools.${ID}.groups.dark`, collapsed: true },
  app: { id: "app", labelKey: `tools.${ID}.groups.app`, collapsed: true },
} as const;

export const faviconGeneratorTool = defineTool({
  id: ID,
  version: 1,
  category: ["icons"],
  schema,
  defaults,
  defaultSize: { width: 512, height: 512 },
  sizePresets: SIZE_PRESETS,
  localParams: ["logo"],
  presets: [
    preset("monogram", {}),
    preset("gradient", {
      text: "A",
      font: "rounded",
      fontWeight: 700,
      backgroundType: "gradient",
      gradientColors: ["#f97316", "#db2777", "#7c3aed"],
      gradientAngle: 135,
      corner: "squircle",
      padding: 16,
      themeColor: "#db2777",
    }),
    preset("badge", {
      content: "shape",
      shape: "star",
      foreground: "#fbbf24",
      backgroundColor: "#1e3a8a",
      corner: "circle",
      padding: 20,
      themeColor: "#1e3a8a",
    }),
    preset("pattern", {
      text: "K",
      font: "serif",
      fontWeight: 700,
      textSize: 80,
      foreground: "#7c2d12",
      backgroundType: "pattern",
      backgroundColor: "#fed7aa",
      pattern: "dots",
      patternColor: "#fdba74",
      patternDensity: 5,
      corner: "rounded",
      radius: 30,
      themeColor: "#fed7aa",
      appBackground: "#fff7ed",
    }),
    preset("minimal", {
      text: "m",
      font: "sans",
      fontWeight: 900,
      textSize: 100,
      foreground: "#111827",
      backgroundType: "transparent",
      padding: 4,
      darkMode: true,
      darkForeground: "#f9fafb",
      darkBackground: "#111827",
      themeColor: "#ffffff",
    }),
    preset("code", {
      text: "</>",
      font: "mono",
      fontWeight: 700,
      textSize: 86,
      foreground: "#4ade80",
      backgroundColor: "#0f172a",
      corner: "square",
      padding: 10,
      darkMode: true,
      darkForeground: "#0f172a",
      darkBackground: "#4ade80",
      themeColor: "#0f172a",
      appBackground: "#0f172a",
    }),
    preset("leaf", {
      content: "shape",
      shape: "leaf",
      foreground: "#166534",
      backgroundType: "gradient",
      gradientColors: ["#dcfce7", "#86efac"],
      gradientType: "radial",
      corner: "squircle",
      padding: 18,
      themeColor: "#22c55e",
      appBackground: "#f0fdf4",
    }),
  ],
  controls: {
    groups: [GROUPS.view, GROUPS.content, GROUPS.background, GROUPS.form, GROUPS.dark, GROUPS.app],
    order: [
      "variant",
      "content",
      "text",
      "logo",
      "logoTint",
      "shape",
      "font",
      "fontWeight",
      "textSize",
      "foreground",
      "backgroundType",
      "backgroundColor",
      "gradientColors",
      "gradientType",
      "gradientAngle",
      "pattern",
      "patternColor",
      "patternDensity",
      "corner",
      "radius",
      "padding",
      "darkMode",
      "darkForeground",
      "darkBackground",
      "appName",
      "shortName",
      "themeColor",
      "appBackground",
    ],
    params: {
      variant: {
        group: "view",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "variant", FAVICON_VARIANTS),
        lockable: false,
      },
      content: {
        group: "content",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "content", FAVICON_CONTENTS),
      },
      text: {
        group: "content",
        kind: "text",
        descriptionKey: describe("text"),
        visibleWhen: showsText,
      },
      logo: {
        group: "content",
        kind: "image",
        lockable: false,
        visibleWhen: (p) => p.content === "image",
      },
      logoTint: {
        group: "content",
        visibleWhen: (p) => p.content === "image" && p.logo !== null,
      },
      shape: {
        group: "content",
        kind: "thumbnails",
        optionLabelKeys: SHAPE_OPTION_LABEL_KEYS,
        optionPreview: (value, p) => shapePreview(value, p.foreground, p.backgroundColor),
        optionGroups: shapePackGroups(),
        visibleWhen: (p) => p.content === "shape",
      },
      font: {
        group: "content",
        optionLabelKeys: optionLabels(ID, "font", FAVICON_FONTS),
        visibleWhen: showsText,
      },
      fontWeight: { group: "content", step: 100, visibleWhen: showsText, advanced: true },
      textSize: { group: "content", step: 1, unit: "%", visibleWhen: showsText },
      foreground: {
        group: "content",
        kind: "color",
        visibleWhen: (p) => p.content !== "image" || p.logo === null || p.logoTint,
      },
      backgroundType: {
        group: "background",
        optionLabelKeys: optionLabels(ID, "backgroundType", FAVICON_BACKGROUNDS),
      },
      backgroundColor: { group: "background", kind: "color", visibleWhen: usesBase },
      gradientColors: {
        group: "background",
        kind: "palette",
        visibleWhen: (p) => p.backgroundType === "gradient",
      },
      gradientType: {
        group: "background",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "gradientType", FAVICON_GRADIENTS),
        visibleWhen: (p) => p.backgroundType === "gradient",
      },
      gradientAngle: {
        group: "background",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => p.backgroundType === "gradient" && p.gradientType === "linear",
      },
      pattern: {
        group: "background",
        optionLabelKeys: optionLabels(ID, "pattern", FAVICON_PATTERNS),
        visibleWhen: (p) => p.backgroundType === "pattern",
      },
      patternColor: {
        group: "background",
        kind: "color",
        visibleWhen: (p) => p.backgroundType === "pattern",
      },
      patternDensity: {
        group: "background",
        step: 1,
        visibleWhen: (p) => p.backgroundType === "pattern",
      },
      corner: {
        group: "form",
        optionLabelKeys: optionLabels(ID, "corner", FAVICON_CORNERS),
      },
      radius: {
        group: "form",
        step: 1,
        unit: "%",
        visibleWhen: (p) => p.corner === "rounded",
      },
      padding: { group: "form", step: 1, unit: "%" },
      darkMode: { group: "dark", descriptionKey: describe("darkMode") },
      darkForeground: { group: "dark", kind: "color", visibleWhen: (p) => p.darkMode },
      darkBackground: { group: "dark", kind: "color", visibleWhen: (p) => p.darkMode },
      appName: { group: "app", kind: "text", lockable: false },
      shortName: {
        group: "app",
        kind: "text",
        lockable: false,
        descriptionKey: describe("shortName"),
      },
      themeColor: { group: "app", kind: "color" },
      appBackground: { group: "app", kind: "color", descriptionKey: describe("appBackground") },
    },
  },
  randomize(rng, current, locks) {
    const colors = randomPalette(rng, 4);
    const base = rng.pick(colors);
    const foreground = readableForeground(base, colors);
    const others = colors.filter((c) => c !== base && c !== foreground);
    const next: FaviconParams = {
      ...current,
      shape: current.content === "shape" ? rng.pick(RANDOM_SHAPES) : current.shape,
      foreground,
      backgroundColor: base,
      gradientColors: [base, ...others.slice(0, rng.int(1, 2))],
      gradientAngle: rng.pick([0, 45, 90, 135, 180, 225, 270, 315]),
      pattern: rng.pick(FAVICON_PATTERNS),
      patternColor: others[0] ?? foreground,
      patternDensity: rng.int(3, 10),
      themeColor: base,
    };
    // A gradient needs two colours (the palette may have repeated its first one).
    if (next.gradientColors.length < 2) next.gradientColors = [base, foreground];
    return keepLocked(next, current, locks);
  },
  brandPalette(colors) {
    const base = colors[0] ?? defaults.backgroundColor;
    const rest = colors.slice(1);
    const foreground = readableForeground(base, rest);
    return {
      backgroundColor: base,
      foreground,
      gradientColors: [...colors],
      patternColor: rest.find((c) => c !== foreground) ?? foreground,
      themeColor: base,
    };
  },
  advisories(p) {
    const out: ToolAdvisory[] = [];
    if (p.variant === "dark" && !p.darkMode) {
      out.push({ id: "dark-off", messageKey: `tools.${ID}.advisories.darkOff` });
    }
    if (p.content === "image" && p.logo === null) {
      out.push({ id: "no-logo", messageKey: `tools.${ID}.advisories.noLogo` });
    }
    return out;
  },
  render: {
    kind: "svg",
    render: (p, ctx) => faviconRender(p, ctx),
  },
  exports: ["png", "webp", "svg"],
  bundles: [
    {
      id: "icon-pack",
      labelKey: `tools.${ID}.bundles.iconPack.label`,
      descriptionKey: `tools.${ID}.bundles.iconPack.description`,
      files: (p) => iconPackFiles(p),
      snippet: {
        labelKey: `tools.${ID}.bundles.iconPack.snippet`,
        language: "html",
        render: (p) => faviconHeadSnippet(p),
      },
    },
  ],
});
