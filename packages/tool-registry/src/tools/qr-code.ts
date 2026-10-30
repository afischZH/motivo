/**
 * QR code generator (docs/TOOLS.md M5). A styled QR code from any text or
 * link: module and eye shapes, solid or gradient ink, eye colour, quiet
 * zone and an optional logo in the middle. Own encoder in the engine, no
 * library. The text travels in share links; the logo stays local.
 */
import {
  QR_EC_LEVELS,
  QR_EYE_SHAPES,
  QR_LOGO_MAX,
  QR_MODULE_SHAPES,
  contrastRatio,
  formatRatio,
  qrCodeSvg,
  qrMatrixFor,
  relativeLuminance,
  type QrCodeOptions,
} from "@musterli/engine";
import * as z from "zod";
import { backgroundSchema, colorSchema, imageAssetSchema, TRANSPARENT } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import { imageAssetHref } from "../svg-asset";
import type { Preset, RenderContext, ToolAdvisory } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels } from "./shared";

const ID = "qr-code";

/** Longest text; plenty for links, Wi-Fi and contact cards, and fits a share link. */
export const QR_TEXT_MAX = 1000;
/** Contrast below which many phone cameras fail. */
const MIN_CONTRAST = 3;

const schema = z.object({
  text: z.string().max(QR_TEXT_MAX),
  ecLevel: z.enum(QR_EC_LEVELS),
  moduleShape: z.enum(QR_MODULE_SHAPES),
  eyeShape: z.enum(QR_EYE_SHAPES),
  ink: colorSchema,
  gradient: z.boolean(),
  ink2: colorSchema,
  gradientAngle: z.int().min(0).max(359),
  eyeColor: colorSchema,
  background: backgroundSchema,
  margin: z.int().min(0).max(10),
  /** The user's logo; local only. */
  logo: imageAssetSchema.nullable(),
  logoSize: z.int().min(10).max(QR_LOGO_MAX),
});

export type QrCodeParams = z.output<typeof schema>;

const defaults: QrCodeParams = {
  text: "https://musterli.app",
  ecLevel: "M",
  moduleShape: "rounded",
  eyeShape: "rounded",
  ink: "#1e1b4b",
  gradient: true,
  ink2: "#7c3aed",
  gradientAngle: 135,
  eyeColor: "#1e1b4b",
  background: "#ffffff",
  margin: 4,
  logo: null,
  logoSize: 22,
};

const preset = (id: string, params: Partial<QrCodeParams>): Preset<QrCodeParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Dark inks that scan well on light backgrounds (for the space bar). */
const DARK_INKS = [
  "#0f172a",
  "#1e1b4b",
  "#312e81",
  "#14532d",
  "#7f1d1d",
  "#134e4a",
  "#3b0764",
  "#1e3a8a",
  "#831843",
  "#422006",
];

const inksOf = (p: QrCodeParams) => (p.gradient ? [p.ink, p.ink2] : [p.ink]);

function optionsOf(p: QrCodeParams, ctx: Pick<RenderContext, "width" | "height">): QrCodeOptions {
  return {
    text: p.text,
    ecLevel: p.ecLevel,
    moduleShape: p.moduleShape,
    eyeShape: p.eyeShape,
    colors: inksOf(p),
    gradientAngle: p.gradientAngle,
    eyeColor: p.eyeColor,
    background: p.background,
    margin: p.margin,
    logoHref: p.logo ? imageAssetHref(p.logo) : null,
    logoSize: p.logoSize,
    width: ctx.width,
    height: ctx.height,
  };
}

const PREVIEW_TEXT = "musterli";

export const qrCodeTool = defineTool({
  id: ID,
  version: 1,
  category: ["icons"],
  schema,
  defaults,
  defaultSize: { width: 1024, height: 1024 },
  localParams: ["logo"],
  contentParams: ["text"],
  presets: [
    preset("rounded", {}),
    preset("classic", {
      moduleShape: "square",
      eyeShape: "square",
      ink: "#000000",
      gradient: false,
      eyeColor: "#000000",
    }),
    preset("dots", {
      moduleShape: "dots",
      eyeShape: "circle",
      ink: "#0f172a",
      gradient: false,
      eyeColor: "#e11d48",
    }),
    preset("ocean", {
      moduleShape: "dots",
      eyeShape: "rounded",
      ink: "#1e3a8a",
      ink2: "#0891b2",
      gradientAngle: 90,
      eyeColor: "#1e3a8a",
      background: "#f0f9ff",
    }),
    preset("forest", {
      moduleShape: "rounded",
      eyeShape: "leaf",
      ink: "#14532d",
      ink2: "#65a30d",
      eyeColor: "#14532d",
      background: "#f7fee7",
    }),
    preset("diamonds", {
      moduleShape: "diamond",
      eyeShape: "square",
      ink: "#3b0764",
      ink2: "#db2777",
      gradientAngle: 45,
      eyeColor: "#3b0764",
    }),
    preset("bars", {
      moduleShape: "lines",
      eyeShape: "circle",
      ink: "#0f172a",
      gradient: false,
      eyeColor: "#0f172a",
    }),
    preset("sunset", {
      moduleShape: "rounded",
      eyeShape: "circle",
      ink: "#7f1d1d",
      ink2: "#ea580c",
      gradientAngle: 180,
      eyeColor: "#7f1d1d",
      background: "#fff7ed",
    }),
    preset("wifi", {
      text: "WIFI:T:WPA;S:Guest network;P:change-me;;",
      moduleShape: "square",
      eyeShape: "rounded",
      ink: "#134e4a",
      gradient: false,
      eyeColor: "#134e4a",
    }),
    preset("transparent", {
      moduleShape: "dots",
      eyeShape: "leaf",
      gradient: false,
      ink: "#111827",
      eyeColor: "#111827",
      background: TRANSPARENT,
    }),
  ],
  controls: {
    groups: [
      { id: "content", labelKey: `tools.${ID}.groups.content` },
      COMMON_GROUPS.shape,
      COMMON_GROUPS.colors,
      { id: "logo", labelKey: `tools.${ID}.groups.logo` },
    ],
    order: [
      "text",
      "ecLevel",
      "moduleShape",
      "eyeShape",
      "margin",
      "ink",
      "gradient",
      "ink2",
      "gradientAngle",
      "eyeColor",
      "background",
      "logo",
      "logoSize",
    ],
    params: {
      text: { group: "content", kind: "text", lockable: false },
      ecLevel: {
        group: "content",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "ecLevel", QR_EC_LEVELS),
        descriptionKey: `tools.${ID}.params.ecLevel.description`,
      },
      moduleShape: {
        group: "shape",
        kind: "thumbnails",
        optionLabelKeys: optionLabels(ID, "moduleShape", QR_MODULE_SHAPES),
        optionPreview(value, p) {
          const { svg } = qrCodeSvg({
            ...optionsOf({ ...p, text: PREVIEW_TEXT, logo: null }, { width: 56, height: 56 }),
            moduleShape: value as QrCodeParams["moduleShape"],
            margin: 1,
            ecLevel: "L",
          });
          return { svg };
        },
      },
      eyeShape: {
        group: "shape",
        kind: "thumbnails",
        optionLabelKeys: optionLabels(ID, "eyeShape", QR_EYE_SHAPES),
        optionPreview(value, p) {
          const { svg } = qrCodeSvg({
            ...optionsOf({ ...p, text: PREVIEW_TEXT, logo: null }, { width: 56, height: 56 }),
            eyeShape: value as QrCodeParams["eyeShape"],
            margin: 1,
            ecLevel: "L",
          });
          return { svg };
        },
      },
      margin: { group: "shape", step: 1 },
      ink: { group: "colors" },
      gradient: { group: "colors" },
      ink2: { group: "colors", visibleWhen: (p) => p.gradient },
      gradientAngle: {
        group: "colors",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => p.gradient,
      },
      eyeColor: { group: "colors" },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      logo: {
        group: "logo",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.logo.description`,
      },
      logoSize: { group: "logo", step: 1, unit: "%", visibleWhen: (p) => p.logo !== null },
    },
  },
  randomize(rng, current, locks) {
    // New look; text, logo and background stay so the code keeps scanning.
    const ink = rng.pick(DARK_INKS);
    const next: QrCodeParams = {
      ...current,
      moduleShape: rng.pick(QR_MODULE_SHAPES),
      eyeShape: rng.pick(QR_EYE_SHAPES),
      ink,
      gradient: rng.bool(0.6),
      ink2: rng.pick(DARK_INKS.filter((c) => c !== ink)),
      gradientAngle: rng.pick([0, 45, 90, 135, 180]),
      eyeColor: rng.bool(0.7) ? ink : rng.pick(DARK_INKS),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors) {
    const [first, second] = colors;
    if (!first) return {};
    return { ink: first, eyeColor: first, ink2: second ?? first };
  },
  advisories(p) {
    const out: ToolAdvisory[] = [];
    if (p.text === "") {
      out.push({ id: "empty", messageKey: `tools.${ID}.advisories.empty` });
      return out;
    }
    if (qrMatrixFor(p.text, p.ecLevel) === null) {
      out.push({ id: "too-long", messageKey: `tools.${ID}.advisories.tooLong` });
      return out;
    }
    if (p.background !== TRANSPARENT) {
      const inks = [...inksOf(p), p.eyeColor];
      const ratio = Math.min(...inks.map((c) => contrastRatio(c, p.background)));
      if (ratio < MIN_CONTRAST) {
        out.push({
          id: "contrast",
          messageKey: `tools.${ID}.advisories.contrast`,
          values: { ratio: formatRatio(ratio), required: String(MIN_CONTRAST) },
        });
      } else if (inks.some((c) => relativeLuminance(c) > relativeLuminance(p.background))) {
        out.push({ id: "inverted", messageKey: `tools.${ID}.advisories.inverted` });
      }
    }
    if (p.logo !== null && (p.ecLevel === "L" || p.ecLevel === "M")) {
      out.push({ id: "logo-level", messageKey: `tools.${ID}.advisories.logoLevel` });
    }
    if (p.margin < 2) out.push({ id: "margin", messageKey: `tools.${ID}.advisories.margin` });
    return out;
  },
  render: {
    kind: "svg",
    render: (p, ctx) => qrCodeSvg(optionsOf(p, ctx)).svg,
  },
  exports: ["svg", "png", "jpg", "webp"],
});
