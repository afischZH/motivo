/**
 * M4c-AP03: Animated CSS gradient (docs/TOOLS.md L3). A moving, rotating or
 * colour-shifting gradient, or soft blobs floating on a base colour, as pure
 * CSS. The preview is the real CSS on an element (and blob boxes) with
 * constant keyframes driven by custom properties; the SVG twin draws the
 * state at time `t` for image exports and GIF frames (frame 0 = the calm
 * state the preview shows when motion is reduced).
 */
import {
  ANIMATED_GRADIENT_COLORS_MAX,
  ANIMATED_GRADIENT_COLORS_MIN,
  ANIMATED_GRADIENT_MODES,
  ANIMATED_GRADIENT_RULES,
  ANIMATION_DIRECTIONS,
  CSS_TIMINGS,
  ROTATE_SHAPES,
  animatedGradientBlobs,
  animatedGradientCss,
  animatedGradientHtml,
  animatedGradientPreview,
  animatedGradientSvg,
  animatedGradientTailwind,
  animatedGradientTailwindTheme,
  randomPalette,
  type AnimatedGradientOptions,
  type Declaration,
  type GradientBlob,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { CssOutput, Preset, RenderContext } from "../types";
import { COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "animated-gradient";

const schema = z.object({
  mode: z.enum(ANIMATED_GRADIENT_MODES),
  palette: z.array(colorSchema).min(ANIMATED_GRADIENT_COLORS_MIN).max(ANIMATED_GRADIENT_COLORS_MAX),
  background: colorSchema,
  angle: z.number().min(0).max(360),
  rotateShape: z.enum(ROTATE_SHAPES),
  duration: z.number().min(2).max(60),
  timing: z.enum(CSS_TIMINGS),
  direction: z.enum(ANIMATION_DIRECTIONS),
  motion: z.int().min(10).max(100),
  blur: z.int().min(0).max(100),
  intensity: z.int().min(20).max(100),
});

export type AnimatedGradientParams = z.output<typeof schema>;

const defaults: AnimatedGradientParams = {
  mode: "pan",
  palette: ["#0ea5e9", "#6366f1", "#a855f7", "#ec4899"],
  background: "#0f172a",
  angle: 120,
  rotateShape: "conic",
  duration: 12,
  timing: "ease-in-out",
  direction: "normal",
  motion: 70,
  blur: 50,
  intensity: 80,
};

const preset = (
  id: string,
  params: Partial<AnimatedGradientParams>,
): Preset<AnimatedGradientParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

function options(p: AnimatedGradientParams, ctx: RenderContext): AnimatedGradientOptions {
  return { ...p, colors: p.palette, width: ctx.width, height: ctx.height };
}

/** Blob layout of the design (seed and size); empty for the other modes. */
function blobsOf(o: AnimatedGradientOptions, ctx: RenderContext): GradientBlob[] {
  return o.mode === "blobs" ? animatedGradientBlobs(ctx.seed, o) : [];
}

const decls = (list: readonly Declaration[]): string =>
  list.map(([prop, value]) => `${prop}: ${value};`).join("\n");

function cssOutput(o: AnimatedGradientOptions, ctx: RenderContext): CssOutput {
  const blobs = blobsOf(o, ctx);
  const preview = animatedGradientPreview(o, blobs);
  const motion = decls(preview.motion);
  const base = o.mode === "blobs" ? o.background : (o.colors[0] ?? o.background);
  return {
    css: `background-color: ${base};`,
    previewSvg: animatedGradientSvg(o, blobs, ctx.t ?? 0),
    element: {
      x: 0,
      y: 0,
      width: ctx.width,
      height: ctx.height,
      css: decls(preview.declarations),
      ...(motion ? { motionCss: motion } : {}),
      content: preview.boxes.map((b) => ({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        css: decls(b.declarations),
        motionCss: decls(b.motion),
      })),
    },
    rules: ANIMATED_GRADIENT_RULES,
  };
}

/** Code outputs share the options and the blob layout of the preview. */
const code =
  (fn: (o: AnimatedGradientOptions, blobs: readonly GradientBlob[]) => string) =>
  (p: AnimatedGradientParams, ctx: RenderContext): string => {
    const o = options(p, ctx);
    return fn(o, blobsOf(o, ctx));
  };

const isBlobs = (p: AnimatedGradientParams) => p.mode === "blobs";

export const animatedGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-effects", "gradients"],
  schema,
  defaults,
  defaultSize: { width: 1200, height: 800 },
  presets: [
    preset("aurora", {}),
    preset("sunset", {
      palette: ["#f97316", "#ec4899", "#8b5cf6"],
      angle: 90,
      duration: 10,
      motion: 50,
    }),
    preset("radar", {
      mode: "rotate",
      palette: ["#0f172a", "#22d3ee", "#a855f7"],
      angle: 0,
      duration: 8,
      timing: "linear",
    }),
    preset("lighthouse", {
      mode: "rotate",
      rotateShape: "linear",
      palette: ["#fde68a", "#f59e0b", "#7c2d12"],
      angle: 45,
      duration: 14,
      timing: "linear",
    }),
    preset("chameleon", {
      mode: "shift",
      palette: ["#10b981", "#3b82f6", "#f43f5e"],
      angle: 135,
      duration: 9,
    }),
    preset("ocean", {
      mode: "shift",
      palette: ["#0c4a6e", "#0891b2", "#67e8f9", "#164e63"],
      angle: 180,
      duration: 16,
      timing: "ease",
    }),
    preset("lava", {
      mode: "blobs",
      background: "#1c0a00",
      palette: ["#f97316", "#dc2626", "#facc15", "#db2777"],
      blur: 60,
      intensity: 90,
      motion: 80,
      duration: 18,
    }),
    preset("pastel", {
      mode: "blobs",
      background: "#fdf4ff",
      palette: ["#c4b5fd", "#fbcfe8", "#a7f3d0", "#fde68a"],
      blur: 70,
      intensity: 85,
      motion: 60,
      duration: 20,
    }),
    preset("candy", {
      palette: ["#ff4d8d", "#c084fc", "#60a5fa", "#34d399"],
      angle: 45,
      duration: 8,
      direction: "reverse",
      motion: 90,
    }),
    preset("neon-ring", {
      mode: "rotate",
      palette: ["#f72585", "#7209b7", "#4cc9f0", "#f72585"],
      angle: 90,
      duration: 6,
      timing: "linear",
      direction: "reverse",
    }),
    preset("forest", {
      mode: "shift",
      palette: ["#081c15", "#2d6a4f", "#95d5b2"],
      angle: 160,
      duration: 22,
      timing: "ease",
    }),
    preset("galaxy", {
      mode: "blobs",
      background: "#030014",
      palette: ["#7c3aed", "#2563eb", "#db2777", "#06b6d4"],
      blur: 80,
      intensity: 70,
      motion: 45,
      duration: 26,
    }),
  ],
  controls: {
    groups: [
      { id: "animation", labelKey: `tools.${ID}.groups.animation` },
      { id: "colors", labelKey: "tools.common.groups.colors" },
      { id: "blobs", labelKey: `tools.${ID}.groups.blobs` },
    ],
    order: [
      "mode",
      "rotateShape",
      "angle",
      "duration",
      "timing",
      "direction",
      "motion",
      "palette",
      "background",
      "blur",
      "intensity",
    ],
    params: {
      mode: {
        group: "animation",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "mode", ANIMATED_GRADIENT_MODES),
        descriptionKey: `tools.${ID}.params.mode.description`,
        lockable: false,
      },
      rotateShape: {
        group: "animation",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "rotateShape", ROTATE_SHAPES),
        visibleWhen: (p) => p.mode === "rotate",
      },
      angle: {
        group: "animation",
        kind: "angle",
        step: 1,
        unit: "°",
        descriptionKey: `tools.${ID}.params.angle.description`,
        visibleWhen: (p) => !isBlobs(p),
      },
      duration: { group: "animation", step: 0.5, unit: "s" },
      timing: {
        group: "animation",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "timing", CSS_TIMINGS),
      },
      direction: {
        group: "animation",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "direction", ANIMATION_DIRECTIONS),
      },
      motion: {
        group: "animation",
        unit: "%",
        descriptionKey: `tools.${ID}.params.motion.description`,
        visibleWhen: (p) => p.mode === "pan" || isBlobs(p),
      },
      palette: { group: "colors", kind: "palette", labelKey: COMMON_LABELS.palette },
      background: {
        group: "colors",
        kind: "color",
        labelKey: COMMON_LABELS.background,
        visibleWhen: isBlobs,
      },
      blur: { group: "blobs", unit: "%", visibleWhen: isBlobs },
      intensity: { group: "blobs", unit: "%", visibleWhen: isBlobs },
    },
  },
  randomize(rng, current, locks) {
    // Space rolls colours, angle and timing; mode, direction, shape and the
    // blob base colour stay. New blob positions come from the new seed.
    const next: AnimatedGradientParams = {
      ...current,
      palette: randomPalette(rng, rng.int(ANIMATED_GRADIENT_COLORS_MIN, 5)),
      angle: rng.int(0, 71) * 5,
      duration: rng.int(6, 24),
      timing: current.mode === "rotate" ? "linear" : rng.pick(["ease", "ease-in-out"] as const),
      motion: rng.int(4, 10) * 10,
      blur: rng.int(3, 8) * 10,
      intensity: rng.int(6, 10) * 10,
    };
    return keepLocked(next, current, locks);
  },
  // The base colour behind the blobs is the user's contrast choice.
  brandPalette: (colors) => ({ palette: colors.slice(0, ANIMATED_GRADIENT_COLORS_MAX) }),
  render: {
    kind: "css",
    render: (p, ctx) => cssOutput(options(p, ctx), ctx),
  },
  exports: ["svg", "png", "jpg", "webp"],
  animation: { sources: ["time", "colors"] },
  extraExports: [
    {
      id: "css",
      labelKey: EXTRA_EXPORT_LABELS.css,
      language: "css",
      render: code(animatedGradientCss),
    },
    {
      id: "html",
      labelKey: EXTRA_EXPORT_LABELS.htmlExample,
      language: "html",
      render: code(animatedGradientHtml),
    },
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render: code(animatedGradientTailwind),
    },
    {
      id: "tailwind-theme",
      labelKey: EXTRA_EXPORT_LABELS.tailwindTheme,
      language: "css",
      render: code(animatedGradientTailwindTheme),
    },
  ],
});
