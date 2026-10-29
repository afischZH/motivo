/**
 * W3: Open Graph image (docs/TOOLS.md M3). The preview picture of a link
 * (Facebook, LinkedIn, X, Slack, WhatsApp ...): title, kicker, subtitle,
 * site name and logo over a Musterli motif (gradient, mesh, blurry
 * gradient, waves, pattern) or the user's own picture. Exports the image
 * and the matching `<meta>` tags.
 *
 * Logo and picture are local params: never in share links. SVG logos are
 * sanitised again before every use and only embedded as images.
 */
import {
  AVATAR_FONTS,
  AVATAR_LIGHT_INK,
  CSS_PATTERN_IDS,
  OG_LAYOUTS,
  OG_PANELS,
  blurryGradientSvg,
  contrastRatio,
  escapeXml,
  fillMarkup,
  formatRatio,
  inkForColors,
  meshGradientSvg,
  ogImage,
  randomPalette,
  svgDocument,
  wavesSvg,
  type OgImageOptions,
} from "@musterli/engine";
import * as z from "zod";
import {
  PHOTO_ASSET_RASTER_MAX_EDGE,
  colorSchema,
  imageAssetSchema,
  paletteSchema,
  photoAssetSchema,
} from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import { imageAssetHref } from "../svg-asset";
import type { Preset, RenderContext } from "../types";
import { PATTERN_GROUPS, PATTERN_LABELS, patternThumbnail } from "./avatar-shared";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "og-image";

export const OG_BACKDROPS = ["solid", "gradient", "mesh", "blurry", "waves", "pattern"] as const;
export type OgBackdrop = (typeof OG_BACKDROPS)[number];

export const OG_TEXT_LIMITS = { eyebrow: 40, title: 140, subtitle: 200, site: 60 } as const;

/** WCAG AA for normal text; the subtitle and site name are normal-sized. */
const AA_RATIO = 4.5;

const schema = z.object({
  layout: z.enum(OG_LAYOUTS),
  eyebrow: z.string().max(OG_TEXT_LIMITS.eyebrow),
  title: z.string().max(OG_TEXT_LIMITS.title),
  subtitle: z.string().max(OG_TEXT_LIMITS.subtitle),
  site: z.string().max(OG_TEXT_LIMITS.site),
  /** The user's logo; local only. */
  logo: imageAssetSchema.nullable(),
  font: z.enum(AVATAR_FONTS),
  titleWeight: z.int().min(300).max(900),
  /** Title size, percent of the height (shrinks to fit three lines). */
  titleSize: z.number().min(5).max(16),
  backdrop: z.enum(OG_BACKDROPS),
  /** Motif colours (gradient, mesh, blurry, waves, pattern ink). */
  palette: paletteSchema,
  /** Base colour of solid, mesh, blurry, waves and pattern backdrops. */
  background: colorSchema,
  gradientAngle: z.number().min(0).max(360),
  pattern: z.enum(CSS_PATTERN_IDS),
  patternScale: z.int().min(8).max(160),
  patternOpacity: z.number().min(5).max(100),
  /** The user's picture over the backdrop; local only. */
  backgroundImage: photoAssetSchema.nullable(),
  panel: z.enum(OG_PANELS),
  panelColor: colorSchema,
  panelOpacity: z.number().min(0).max(100),
  inkAuto: z.boolean(),
  ink: colorSchema,
  accent: colorSchema,
  /** Margin, percent of the shorter edge. */
  padding: z.number().min(3).max(16),
});

export type OgImageParams = z.output<typeof schema>;

const defaults: OgImageParams = {
  layout: "classic",
  eyebrow: "New",
  title: "Ship beautiful websites in half the time",
  subtitle: "Patterns, gradients and code for your next launch",
  site: "example.com",
  logo: null,
  font: "sans",
  titleWeight: 800,
  titleSize: 10.5,
  backdrop: "mesh",
  palette: ["#6366f1", "#ec4899", "#f59e0b"],
  background: "#1e1b4b",
  gradientAngle: 135,
  pattern: "polka",
  patternScale: 32,
  patternOpacity: 18,
  backgroundImage: null,
  panel: "scrim",
  panelColor: "#0f0a2e",
  panelOpacity: 60,
  inkAuto: true,
  ink: "#ffffff",
  accent: "#facc15",
  padding: 8,
};

const preset = (id: string, params: Partial<OgImageParams>): Preset<OgImageParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** The backdrop as an SVG document of the render size. */
function backdropSvg(p: OgImageParams, ctx: RenderContext): string {
  const { width, height, rng } = ctx;
  const [first = p.background, second = first] = p.palette;
  const href = p.backgroundImage ? imageAssetHref(p.backgroundImage) : null;
  if (href) {
    return svgDocument(
      width,
      height,
      `<rect width="${width}" height="${height}" fill="${p.background}"/>` +
        `<image href="${escapeXml(href)}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  }
  switch (p.backdrop) {
    case "solid":
      return svgDocument(
        width,
        height,
        `<rect width="${width}" height="${height}" fill="${p.background}"/>`,
      );
    case "gradient":
    case "pattern": {
      const fill = fillMarkup(
        {
          fill: p.backdrop,
          base: p.backdrop === "pattern" ? p.background : first,
          second,
          ink: first,
          gradientAngle: p.gradientAngle,
          pattern: p.pattern,
          patternSize: p.patternScale,
          patternOpacity: p.patternOpacity / 100,
        },
        0,
        0,
        width,
        height,
      );
      return svgDocument(
        width,
        height,
        `${fill.defs ? `<defs>${fill.defs}</defs>` : ""}${fill.body}`,
      );
    }
    case "mesh":
      return meshGradientSvg({
        width,
        height,
        background: p.background,
        colors: p.palette,
        points: Math.min(6, p.palette.length + 2),
        blur: 0.85,
        warp: 0.4,
        rng,
      });
    case "blurry":
      return blurryGradientSvg({
        width,
        height,
        background: p.background,
        colors: p.palette,
        circles: Math.min(5, Math.max(3, p.palette.length + 1)),
        layout: "corners",
        size: 0.55,
        spread: 0.4,
        opacity: 0.9,
        blur: 0.8,
        rng,
      });
    case "waves":
      return wavesSvg({
        width,
        height,
        rng,
        background: p.background,
        colors: p.palette,
        layers: 3,
        points: 6,
        amplitude: 0.6,
        smoothness: 1,
        coverage: 0.55,
        direction: "up",
      });
  }
}

/** Colours behind the text, for the automatic text colour and the contrast hint. */
function surfaceColors(p: OgImageParams): string[] | null {
  if (p.layout === "split" || (p.panel !== "none" && p.panelOpacity >= 50)) return [p.panelColor];
  if (p.backgroundImage) return null;
  switch (p.backdrop) {
    case "solid":
    case "pattern":
      return [p.background];
    case "gradient":
      return p.palette.slice(0, 2);
    default:
      return [p.background, ...p.palette];
  }
}

function inkOf(p: OgImageParams): string {
  if (!p.inkAuto) return p.ink;
  const colors = surfaceColors(p);
  // An unknown picture: white text, the hint suggests a panel.
  return colors ? inkForColors(colors) : AVATAR_LIGHT_INK;
}

function logoOf(p: OgImageParams): OgImageOptions["logo"] {
  if (!p.logo) return null;
  const href = imageAssetHref(p.logo);
  return href ? { href, aspect: p.logo.width / p.logo.height } : null;
}

function optionsOf(p: OgImageParams, ctx: RenderContext, backdrop: string): OgImageOptions {
  return {
    width: ctx.width,
    height: ctx.height,
    backdrop,
    layout: p.layout,
    panel: p.panel,
    panelColor: p.panelColor,
    panelOpacity: p.panelOpacity / 100,
    eyebrow: p.eyebrow.trim(),
    title: p.title.trim(),
    subtitle: p.subtitle.trim(),
    site: p.site.trim(),
    logo: logoOf(p),
    font: p.font,
    titleWeight: p.titleWeight,
    titleSize: p.titleSize,
    ink: inkOf(p),
    accent: p.accent,
    padding: p.padding,
  };
}

const attr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `<meta>` tags for Open Graph and X cards; the image URL is a placeholder. */
export function ogMetaTags(p: OgImageParams, ctx: RenderContext): string {
  const title = p.title.trim();
  const description = p.subtitle.trim();
  const site = p.site.trim();
  const lines = [
    `<!-- Upload the image to your site and use its absolute URL -->`,
    `<meta property="og:type" content="website">`,
  ];
  if (title !== "") lines.push(`<meta property="og:title" content="${attr(title)}">`);
  if (description !== "")
    lines.push(`<meta property="og:description" content="${attr(description)}">`);
  if (site !== "") lines.push(`<meta property="og:site_name" content="${attr(site)}">`);
  lines.push(
    `<meta property="og:image" content="https://example.com/og-image.png">`,
    `<meta property="og:image:width" content="${Math.round(ctx.width)}">`,
    `<meta property="og:image:height" content="${Math.round(ctx.height)}">`,
  );
  if (title !== "") lines.push(`<meta property="og:image:alt" content="${attr(title)}">`);
  lines.push(`<meta name="twitter:card" content="summary_large_image">`);
  return `${lines.join("\n")}\n`;
}

const hasPicture = (p: OgImageParams) => p.backgroundImage !== null;
const motif = (p: OgImageParams) => !hasPicture(p);

export const ogImageTool = defineTool({
  id: ID,
  version: 1,
  category: ["social", "backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1200, height: 630 },
  localParams: ["logo", "backgroundImage"],
  // Presets restyle the user's text instead of wiping it.
  contentParams: ["eyebrow", "title", "subtitle", "site"],
  // "Weiterverwenden in": a design of another tool becomes the picture.
  imageTargets: [{ param: "backgroundImage" }],
  presets: [
    preset("launch", {}),
    preset("article", {
      backdrop: "gradient",
      palette: ["#e0f2fe", "#fce7f3"],
      gradientAngle: 120,
      panel: "card",
      panelColor: "#ffffff",
      panelOpacity: 85,
      accent: "#2563eb",
      font: "serif",
      titleWeight: 700,
    }),
    preset("centered", {
      layout: "centered",
      backdrop: "blurry",
      palette: ["#22d3ee", "#a78bfa", "#f472b6"],
      background: "#0b1120",
      panel: "none",
      accent: "#22d3ee",
    }),
    preset("split", {
      layout: "split",
      backdrop: "waves",
      palette: ["#99f6e4", "#14b8a6", "#0f766e"],
      background: "#f0fdfa",
      panelColor: "#042f2e",
      accent: "#5eead4",
    }),
    preset("minimal", {
      layout: "minimal",
      backdrop: "solid",
      background: "#fafaf9",
      panel: "none",
      accent: "#111827",
      eyebrow: "",
      titleWeight: 700,
      titleSize: 12,
    }),
    preset("dotted", {
      backdrop: "pattern",
      pattern: "polka",
      palette: ["#fb923c", "#f97316"],
      background: "#fff7ed",
      patternOpacity: 30,
      panel: "card",
      panelColor: "#fff7ed",
      panelOpacity: 92,
      accent: "#ea580c",
    }),
    preset("night", {
      layout: "centered",
      backdrop: "mesh",
      palette: ["#1d4ed8", "#7c3aed", "#0891b2"],
      background: "#020617",
      panel: "none",
      font: "mono",
      titleWeight: 700,
      accent: "#38bdf8",
    }),
  ],
  controls: {
    groups: [
      { id: "content", labelKey: `tools.${ID}.groups.content` },
      { id: "type", labelKey: `tools.${ID}.groups.type` },
      { id: "backdrop", labelKey: `tools.${ID}.groups.backdrop` },
      { id: "panel", labelKey: `tools.${ID}.groups.panel` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "layout",
      "eyebrow",
      "title",
      "subtitle",
      "site",
      "logo",
      "font",
      "titleWeight",
      "titleSize",
      "padding",
      "backdrop",
      "backgroundImage",
      "palette",
      "background",
      "gradientAngle",
      "pattern",
      "patternScale",
      "patternOpacity",
      "panel",
      "panelColor",
      "panelOpacity",
      "inkAuto",
      "ink",
      "accent",
    ],
    params: {
      layout: {
        group: "content",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "layout", OG_LAYOUTS),
      },
      eyebrow: { group: "content", kind: "text", lockable: false },
      title: { group: "content", kind: "text", lockable: false },
      subtitle: { group: "content", kind: "text", lockable: false },
      site: { group: "content", kind: "text", lockable: false },
      logo: {
        group: "content",
        kind: "image",
        lockable: false,
        // The picture field takes pasted images.
        image: { paste: false },
      },
      font: {
        group: "type",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "font", AVATAR_FONTS),
      },
      titleWeight: { group: "type", step: 100 },
      titleSize: { group: "type", step: 0.5, unit: "%" },
      padding: { group: "type", step: 0.5, unit: "%", advanced: true },
      backdrop: {
        group: "backdrop",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "backdrop", OG_BACKDROPS),
        visibleWhen: motif,
      },
      backgroundImage: {
        group: "backdrop",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.backgroundImage.description`,
        image: { maxEdge: PHOTO_ASSET_RASTER_MAX_EDGE, photo: true },
      },
      palette: {
        group: "backdrop",
        labelKey: COMMON_LABELS.palette,
        visibleWhen: (p) => motif(p) && p.backdrop !== "solid",
      },
      background: { group: "backdrop", labelKey: COMMON_LABELS.background },
      gradientAngle: {
        group: "backdrop",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => motif(p) && p.backdrop === "gradient",
      },
      pattern: {
        group: "backdrop",
        kind: "thumbnails",
        optionLabelKeys: PATTERN_LABELS,
        optionGroups: PATTERN_GROUPS,
        optionPreview: (value, p) => patternThumbnail(value, p.background, p.palette[0]),
        visibleWhen: (p) => motif(p) && p.backdrop === "pattern",
      },
      patternScale: {
        group: "backdrop",
        step: 1,
        unit: "px",
        visibleWhen: (p) => motif(p) && p.backdrop === "pattern",
      },
      patternOpacity: {
        group: "backdrop",
        step: 1,
        unit: "%",
        visibleWhen: (p) => motif(p) && p.backdrop === "pattern",
      },
      panel: {
        group: "panel",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "panel", OG_PANELS),
        visibleWhen: (p) => p.layout !== "split",
      },
      panelColor: {
        group: "panel",
        visibleWhen: (p) => p.layout === "split" || p.panel !== "none",
      },
      panelOpacity: {
        group: "panel",
        step: 1,
        unit: "%",
        visibleWhen: (p) => p.layout !== "split" && p.panel !== "none",
      },
      inkAuto: { group: "colors" },
      ink: { group: "colors", visibleWhen: (p) => !p.inkAuto },
      accent: { group: "colors" },
    },
  },
  randomize(rng, current, locks) {
    // New colours and motif; text, layout, panel and pictures stay.
    const palette = randomPalette(rng, 3);
    const next: OgImageParams = {
      ...current,
      palette,
      backdrop: rng.pick(OG_BACKDROPS.filter((b) => b !== "solid")),
      gradientAngle: rng.int(0, 7) * 45,
      pattern: rng.pick(
        PATTERN_GROUPS.flatMap((g) => g.values.map(String)),
      ) as OgImageParams["pattern"],
      accent: palette[palette.length - 1] ?? current.accent,
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors, current) {
    return { palette: colors.slice(), accent: colors[0] ?? current.accent, inkAuto: true };
  },
  advisories(p, ctx) {
    const out: { id: string; messageKey: string; values?: Record<string, string> }[] = [];
    // Layout only: the backdrop does not change where text breaks.
    if (ogImage(optionsOf(p, ctx, "")).truncated) {
      out.push({ id: "truncated", messageKey: `tools.${ID}.advisories.truncated` });
    }
    const colors = surfaceColors(p);
    if (!colors) {
      if (p.panel === "none") {
        out.push({ id: "picture-contrast", messageKey: `tools.${ID}.advisories.pictureContrast` });
      }
    } else {
      const ink = inkOf(p);
      const ratio = Math.min(...colors.map((c) => contrastRatio(ink, c)));
      if (ratio < AA_RATIO) {
        out.push({
          id: "text-contrast",
          messageKey: `tools.${ID}.advisories.textContrast`,
          values: { ratio: formatRatio(ratio), required: "4.5" },
        });
      }
    }
    return out;
  },
  render: {
    kind: "svg",
    render: (p, ctx) => ogImage(optionsOf(p, ctx, backdropSvg(p, ctx))).svg,
  },
  exports: ["png", "jpg", "webp", "svg"],
  extraExports: [
    {
      id: "meta-tags",
      labelKey: EXTRA_EXPORT_LABELS.metaTags,
      language: "html",
      render: ogMetaTags,
    },
  ],
});
