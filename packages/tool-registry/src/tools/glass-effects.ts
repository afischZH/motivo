/**
 * M4-AP06: Glass and border effects (docs/TOOLS.md J2). A card on a
 * selectable Musterli stage, styled as frosted glass, with a gradient border
 * (static or rotating) or with a glow. The preview is the real CSS on a real
 * element; the SVG twin serves motifs and the image exports of border and
 * glow (glass depends on the page behind it, so it exports code only).
 */
import {
  GLASS_BACKDROPS,
  GLASS_EFFECTS,
  GLASS_IMAGE_FITS,
  IMAGE_POSITIONS,
  bestTextColor,
  createRng,
  deriveSeed,
  formatRatio,
  glassCss,
  glassEffect,
  glassGrainTile,
  glassHtml,
  glassStageColors,
  glassTailwind,
  glassTextContrast,
  pngDataUri,
  randomPalette,
  type Declaration,
  type GlassImage,
  type GlassOptions,
  type GlassResult,
} from "@musterli/engine";
import * as z from "zod";
import {
  PHOTO_ASSET_RASTER_MAX_EDGE,
  assetPlaceholderName,
  colorSchema,
  paletteSchema,
  photoAssetSchema,
} from "../common";
import { imageAssetHref } from "../svg-asset";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { CssOutput, Preset, RenderContext } from "../types";
import { cachedTile } from "./grain";
import { EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "glass-effects";

/** WCAG AA for normal text. */
const AA_RATIO = 4.5;

const schema = z.object({
  effect: z.enum(GLASS_EFFECTS),
  backdrop: z.enum(GLASS_BACKDROPS),
  backdropPalette: paletteSchema,
  /** The user's own stage picture; `null` = the generated backdrop. Local only. */
  backgroundImage: photoAssetSchema.nullable(),
  imageFit: z.enum(GLASS_IMAGE_FITS),
  imagePosition: z.enum(IMAGE_POSITIONS),
  /** Code exports carry the picture as a data URI instead of a placeholder file name. */
  embedImage: z.boolean(),
  cardWidth: z.int().min(20).max(95),
  cardHeight: z.int().min(20).max(95),
  radius: z.int().min(0).max(96),
  shadow: z.int().min(0).max(100),
  textColor: colorSchema,
  blur: z.int().min(0).max(64),
  tint: colorSchema,
  tintOpacity: z.int().min(0).max(100),
  saturation: z.int().min(100).max(250),
  border: z.int().min(0).max(100),
  noise: z.int().min(0).max(100),
  borderPalette: paletteSchema,
  borderWidth: z.int().min(1).max(24),
  borderAngle: z.number().min(0).max(360),
  animated: z.boolean(),
  speed: z.number().min(1).max(20),
  surface: colorSchema,
  glowColor: colorSchema,
  glowSize: z.int().min(4).max(160),
  glowIntensity: z.int().min(0).max(100),
});

export type GlassEffectsParams = z.output<typeof schema>;

const defaults: GlassEffectsParams = {
  effect: "glass",
  backdrop: "aurora",
  backdropPalette: ["#1e1b4b", "#7c3aed", "#db2777", "#2563eb"],
  backgroundImage: null,
  imageFit: "cover",
  imagePosition: "center",
  embedImage: false,
  cardWidth: 50,
  cardHeight: 45,
  radius: 24,
  shadow: 40,
  textColor: "#ffffff",
  blur: 16,
  tint: "#0f172a",
  tintOpacity: 20,
  saturation: 160,
  border: 35,
  noise: 0,
  borderPalette: ["#f472b6", "#a78bfa", "#38bdf8"],
  borderWidth: 3,
  borderAngle: 0,
  animated: false,
  speed: 6,
  surface: "#0f172a",
  glowColor: "#38bdf8",
  glowSize: 48,
  glowIntensity: 70,
};

const preset = (id: string, params: Partial<GlassEffectsParams>): Preset<GlassEffectsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Grain tile (PNG data URI) for glass, cached per seed and amount; own rng stream. */
function grainHref(seed: number, noise: number): string | undefined {
  if (!(noise > 0)) return undefined;
  return cachedTile(`glass|${seed}|${noise}`, () =>
    pngDataUri(glassGrainTile(createRng(deriveSeed(seed, "grain")), noise / 100), "rgba"),
  );
}

/** Placeholder base name of the stage picture in code exports. */
export const GLASS_IMAGE_PLACEHOLDER = "your-image";

function stageImage(p: GlassEffectsParams): GlassImage | undefined {
  const asset = p.backgroundImage;
  if (!asset) return undefined;
  const href = imageAssetHref(asset);
  if (!href) return undefined;
  return {
    href,
    fit: p.imageFit,
    position: p.imagePosition,
    codeUrl: p.embedImage ? href : assetPlaceholderName(GLASS_IMAGE_PLACEHOLDER, asset),
  };
}

function options(p: GlassEffectsParams, ctx: RenderContext): GlassOptions {
  const href = p.effect === "glass" ? grainHref(ctx.seed, p.noise) : undefined;
  const image = stageImage(p);
  return {
    ...p,
    width: ctx.width,
    height: ctx.height,
    ...(href ? { grainHref: href } : {}),
    ...(image ? { image } : {}),
  };
}

const decls = (list: readonly Declaration[]): string =>
  list.map(([prop, value]) => `${prop}: ${value};`).join("\n");

function cssOutput(r: GlassResult, p: GlassEffectsParams): CssOutput {
  const motion = decls(r.card.motion);
  const out: CssOutput = {
    css: r.stageCss,
    previewSvg: r.svg,
    element: {
      x: r.card.x,
      y: r.card.y,
      width: r.card.width,
      height: r.card.height,
      css: `${decls(r.card.declarations)}\ncolor: ${p.textColor};`,
      ...(motion ? { motionCss: motion } : {}),
      content: r.card.content,
    },
  };
  if (r.rules) out.rules = r.rules;
  return out;
}

const scene = (p: GlassEffectsParams, ctx: RenderContext) => {
  const o = options(p, ctx);
  return { o, r: glassEffect(ctx.rng, o) };
};

const isGlass = (p: GlassEffectsParams) => p.effect === "glass";
const hasImage = (p: GlassEffectsParams) => p.backgroundImage !== null;

/** Params added after the first release (share links and designs from before lack them). */
const ADDED_IN_AP06B = ["backgroundImage", "imageFit", "imagePosition", "embedImage"] as const;
const isBorder = (p: GlassEffectsParams) => p.effect === "gradient-border";
const isGlow = (p: GlassEffectsParams) => p.effect === "glow";

export const glassEffectsTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-effects", "backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1200, height: 800 },
  // The picture never leaves the device; its fit, position and embed choice
  // mean nothing without it, so they stay local too (short share links).
  localParams: ["backgroundImage", "imageFit", "imagePosition", "embedImage"],
  // "Weiterverwenden in": a design of another tool becomes the backdrop.
  imageTargets: [{ param: "backgroundImage" }],
  migrateParams(raw) {
    if (ADDED_IN_AP06B.every((key) => key in raw)) return raw;
    const out: Record<string, unknown> = { ...raw };
    for (const key of ADDED_IN_AP06B) if (!(key in out)) out[key] = defaults[key];
    return out;
  },
  presets: [
    preset("frosted", {}),
    preset("ice", {
      backdrop: "shapes",
      backdropPalette: ["#e0f2fe", "#0ea5e9", "#f97316", "#6366f1"],
      tint: "#ffffff",
      tintOpacity: 35,
      blur: 24,
      saturation: 140,
      border: 60,
      textColor: "#0f172a",
      shadow: 25,
    }),
    preset("smoke", {
      backdrop: "gradient",
      backdropPalette: ["#f97316", "#db2777", "#4c1d95"],
      tint: "#0f172a",
      tintOpacity: 45,
      blur: 20,
      saturation: 120,
      border: 20,
      radius: 16,
    }),
    preset("grainy", {
      backdrop: "stripes",
      backdropPalette: ["#14532d", "#4ade80", "#bbf7d0"],
      tint: "#052e16",
      tintOpacity: 60,
      blur: 12,
      noise: 45,
      border: 25,
      radius: 32,
    }),
    preset("neon-ring", {
      effect: "gradient-border",
      backdrop: "grid",
      backdropPalette: ["#020617", "#1e293b"],
      borderPalette: ["#22d3ee", "#a855f7", "#f43f5e"],
      borderWidth: 3,
      animated: true,
      speed: 5,
      surface: "#0b1120",
      shadow: 60,
    }),
    preset("sunset-frame", {
      effect: "gradient-border",
      backdrop: "dots",
      backdropPalette: ["#fff7ed", "#fdba74"],
      borderPalette: ["#f59e0b", "#ef4444", "#ec4899"],
      borderWidth: 6,
      borderAngle: 45,
      surface: "#ffffff",
      textColor: "#431407",
      radius: 20,
      shadow: 30,
    }),
    preset("mint-glow", {
      effect: "glow",
      backdrop: "aurora",
      backdropPalette: ["#022c22", "#065f46", "#0f766e"],
      glowColor: "#34d399",
      glowSize: 64,
      glowIntensity: 75,
      surface: "#022c22",
      radius: 28,
      shadow: 0,
    }),
    preset("violet-glow", {
      effect: "glow",
      backdrop: "grid",
      backdropPalette: ["#0c0a1d", "#1e1b4b"],
      glowColor: "#a78bfa",
      glowSize: 96,
      glowIntensity: 60,
      surface: "#1e1b4b",
      radius: 12,
      cardWidth: 40,
      cardHeight: 40,
      shadow: 0,
    }),
  ],
  controls: {
    groups: [
      { id: "effect", labelKey: `tools.${ID}.groups.effect` },
      { id: "glass", labelKey: `tools.${ID}.groups.glass` },
      { id: "border", labelKey: `tools.${ID}.groups.border` },
      { id: "glow", labelKey: `tools.${ID}.groups.glow` },
      { id: "card", labelKey: `tools.${ID}.groups.card` },
      { id: "stage", labelKey: `tools.${ID}.groups.stage` },
    ],
    order: [
      "effect",
      "blur",
      "tint",
      "tintOpacity",
      "saturation",
      "border",
      "noise",
      "borderPalette",
      "borderWidth",
      "borderAngle",
      "animated",
      "speed",
      "glowColor",
      "glowSize",
      "glowIntensity",
      "surface",
      "textColor",
      "radius",
      "shadow",
      "cardWidth",
      "cardHeight",
      "backgroundImage",
      "imageFit",
      "imagePosition",
      "embedImage",
      "backdrop",
      "backdropPalette",
    ],
    params: {
      effect: {
        group: "effect",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "effect", GLASS_EFFECTS),
        lockable: false,
      },
      blur: { group: "glass", unit: "px", visibleWhen: isGlass },
      tint: { group: "glass", visibleWhen: isGlass },
      tintOpacity: { group: "glass", unit: "%", visibleWhen: isGlass },
      saturation: { group: "glass", unit: "%", step: 5, visibleWhen: isGlass },
      border: { group: "glass", unit: "%", visibleWhen: isGlass },
      noise: { group: "glass", unit: "%", visibleWhen: isGlass },
      borderPalette: { group: "border", visibleWhen: isBorder },
      borderWidth: { group: "border", unit: "px", visibleWhen: isBorder },
      borderAngle: { group: "border", kind: "angle", step: 1, unit: "°", visibleWhen: isBorder },
      animated: { group: "border", visibleWhen: isBorder },
      speed: {
        group: "border",
        step: 0.5,
        unit: "s",
        visibleWhen: (p) => isBorder(p) && p.animated,
      },
      glowColor: { group: "glow", visibleWhen: isGlow },
      glowSize: { group: "glow", unit: "px", visibleWhen: isGlow },
      glowIntensity: { group: "glow", unit: "%", visibleWhen: isGlow },
      surface: { group: "card", visibleWhen: (p) => !isGlass(p) },
      textColor: { group: "card" },
      radius: { group: "card", unit: "px" },
      shadow: { group: "card", unit: "%" },
      cardWidth: { group: "card", unit: "%", advanced: true },
      cardHeight: { group: "card", unit: "%", advanced: true },
      backgroundImage: {
        group: "stage",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.backgroundImage.description`,
        image: { maxEdge: PHOTO_ASSET_RASTER_MAX_EDGE, photo: true },
      },
      imageFit: {
        group: "stage",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "imageFit", GLASS_IMAGE_FITS),
        visibleWhen: hasImage,
      },
      imagePosition: {
        group: "stage",
        optionLabelKeys: optionLabels(ID, "imagePosition", IMAGE_POSITIONS),
        visibleWhen: hasImage,
      },
      embedImage: {
        group: "stage",
        advanced: true,
        lockable: false,
        descriptionKey: `tools.${ID}.params.embedImage.description`,
        visibleWhen: hasImage,
      },
      backdrop: {
        group: "stage",
        optionLabelKeys: optionLabels(ID, "backdrop", GLASS_BACKDROPS),
        visibleWhen: (p) => !hasImage(p),
      },
      backdropPalette: { group: "stage" },
    },
  },
  randomize(rng, current, locks) {
    const backdropPalette = randomPalette(rng, rng.int(2, 4));
    const dark = rng.bool(0.5);
    const tint = dark ? "#0f172a" : "#ffffff";
    const tintOpacity = rng.int(dark ? 25 : 10, dark ? 55 : 40);
    const borderPalette = randomPalette(rng, rng.int(2, 4));
    const glowColor = randomPalette(rng, 2)[0] as string;
    const surface = dark ? "#0f172a" : "#ffffff";
    const next: GlassEffectsParams = {
      ...current,
      backdrop: rng.pick(GLASS_BACKDROPS),
      backdropPalette,
      radius: rng.int(2, 10) * 4,
      blur: rng.int(4, 32),
      tint,
      tintOpacity,
      saturation: rng.int(20, 36) * 5,
      border: rng.int(0, 60),
      borderPalette,
      borderAngle: rng.int(0, 71) * 5,
      surface,
      glowColor,
      glowSize: rng.int(6, 30) * 4,
      glowIntensity: rng.int(40, 90),
    };
    // Readable text on the new surface: the better of white and near-black.
    const probe = mixProbe(next);
    next.textColor = bestTextColor(probe, ["#ffffff", "#0f172a"]).color;
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "css",
    render(p, ctx) {
      const { r } = scene(p, ctx);
      return cssOutput(r, p);
    },
  },
  exports: ["png", "webp"],
  // Glass shows whatever is behind it on the target page: code only (TOOLS.md J2).
  exportsFor: (p) => (p.effect === "glass" ? [] : ["png", "webp"]),
  extraExports: [
    {
      id: "css",
      labelKey: EXTRA_EXPORT_LABELS.css,
      language: "css",
      render(p, ctx) {
        const { r } = scene(p, ctx);
        return glassCss(r, p.effect, p.textColor);
      },
    },
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render(p, ctx) {
        const { o, r } = scene(p, ctx);
        return glassTailwind(r, o);
      },
    },
    {
      id: "html",
      labelKey: EXTRA_EXPORT_LABELS.htmlExample,
      language: "html",
      render(p, ctx) {
        const { o, r } = scene(p, ctx);
        return glassHtml(r, o);
      },
    },
  ],
  advisories(p, ctx) {
    const o = options(p, ctx);
    // The pixels of a picture are unknown here: say so instead of guessing.
    if (o.image && p.effect === "glass") {
      return [{ id: "image-contrast", messageKey: `tools.${ID}.advisories.imageContrast` }];
    }
    const ratio = glassTextContrast(o, glassStageColors(ctx.rng, o));
    if (ratio >= AA_RATIO) return [];
    return [
      {
        id: "text-contrast",
        messageKey: `tools.${ID}.advisories.textContrast`,
        values: { ratio: formatRatio(ratio), required: "4.5" },
      },
    ];
  },
});

/** Rough surface colour behind the text, used to pick a text colour when randomising. */
function mixProbe(p: GlassEffectsParams): string {
  if (p.effect !== "glass") return p.surface;
  return p.tintOpacity >= 25 ? p.tint : (p.backdropPalette[0] as string);
}
