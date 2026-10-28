/**
 * M4b-AP03: Guilloche (docs/TOOLS.md K4). Fine interlaced line work like on
 * banknotes, certificates and vouchers: a rosette, a tileable band or a
 * frame around the canvas, with an optional second layer on top.
 *
 * The renderer has no randomness (the seed changes nothing); the space bar
 * rolls new params through `randomize`. GIF: "Motion" advances the phase of
 * every line once around (seamless loop) and colour cycling.
 */
import {
  GUILLOCHE_COLOR_MODES,
  GUILLOCHE_CURVES,
  GUILLOCHE_LAYOUTS,
  bandEdges,
  guillocheSvg,
  randomPalette,
  type GuillocheCurve,
  type Rng,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { AnimationSupport, ControlGroup, Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "guilloche";

const schema = visualParamsSchema.extend({
  layout: z.enum(GUILLOCHE_LAYOUTS),
  /** Periods along a band or frame (the rosette has one). */
  repeats: z.int().min(1).max(48),
  /** Rosette turn in degrees. */
  rotation: z.number().min(0).max(360),
  /** Inner and outer edge of the band, see `guillocheMapper`. */
  inner: z.number().min(0).max(1),
  outer: z.number().min(0).max(1),
  curve: z.enum(GUILLOCHE_CURVES),
  lines: z.int().min(1).max(96),
  petals: z.int().min(1).max(48),
  frequency: z.int().min(1).max(96),
  amplitude: z.number().min(0).max(1),
  /** Share of a full phase turn spread across the lines. */
  spread: z.number().min(0).max(1),
  /** Stroke width in px. */
  lineWidth: z.number().min(0.25).max(8),
  colorMode: z.enum(GUILLOCHE_COLOR_MODES),
  gradientAngle: z.number().min(0).max(360),
  overlay: z.boolean(),
  overlayCurve: z.enum(GUILLOCHE_CURVES),
  overlayLines: z.int().min(1).max(96),
  overlayPetals: z.int().min(1).max(48),
  overlayFrequency: z.int().min(1).max(96),
  overlayAmplitude: z.number().min(0).max(1),
  overlayColor: colorSchema,
});

export type GuillocheParams = z.output<typeof schema>;

const defaults: GuillocheParams = {
  background: "#f7f3e8",
  palette: ["#0f766e", "#1e3a8a"],
  layout: "rosette",
  repeats: 12,
  rotation: 0,
  inner: 0.3,
  outer: 0.92,
  curve: "weave",
  lines: 24,
  petals: 12,
  frequency: 9,
  amplitude: 0.5,
  spread: 1,
  lineWidth: 1,
  colorMode: "blend",
  gradientAngle: 90,
  overlay: false,
  overlayCurve: "spiro",
  overlayLines: 18,
  overlayPetals: 6,
  overlayFrequency: 11,
  overlayAmplitude: 0.4,
  overlayColor: "#b45309",
};

const preset = (id: string, params: Partial<GuillocheParams>): Preset<GuillocheParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

const OVERLAY_GROUP: ControlGroup = { id: "overlay", labelKey: `tools.${ID}.groups.overlay` };

const notRosette = (p: GuillocheParams): boolean => p.layout !== "rosette";
const withOverlay = (p: GuillocheParams): boolean => p.overlay;

/** Spiro curves and rich weaves look best with a few more loops; keeps random picks tasteful. */
function rollCurve(rng: Rng): GuillocheCurve {
  const r = rng.next();
  return r < 0.45 ? "weave" : r < 0.75 ? "spiro" : "harmonic";
}

/** Motion (phase turn) first, then colour cycling. */
const GUILLOCHE_ANIMATION = {
  sources: ["time", "colors"],
} as const satisfies AnimationSupport<unknown>;

export const guillocheTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1200, height: 1200 },
  presets: [
    preset("banknote", {
      background: "#eef3e2",
      palette: ["#166534", "#0e7490", "#4d7c0f"],
      curve: "weave",
      lines: 28,
      petals: 16,
      frequency: 7,
      amplitude: 0.55,
      inner: 0.22,
      outer: 0.94,
      lineWidth: 0.8,
      colorMode: "iris",
      gradientAngle: 120,
      overlay: true,
      overlayCurve: "spiro",
      overlayLines: 16,
      overlayPetals: 8,
      overlayFrequency: 3,
      overlayAmplitude: 0.35,
      overlayColor: "#7c2d12",
    }),
    preset("certificate", {
      background: "#fbf8ef",
      palette: ["#1e3a8a", "#0f766e"],
      layout: "frame",
      repeats: 30,
      inner: 0.82,
      outer: 0.97,
      curve: "weave",
      lines: 12,
      petals: 1,
      frequency: 2,
      amplitude: 0.6,
      lineWidth: 0.9,
      colorMode: "alternate",
    }),
    preset("voucher", {
      background: "#fff7ed",
      palette: ["#c2410c", "#be185d", "#7e22ce"],
      layout: "band",
      repeats: 10,
      inner: 0.36,
      outer: 0.64,
      curve: "weave",
      lines: 12,
      petals: 1,
      frequency: 2,
      amplitude: 0.7,
      lineWidth: 1.2,
      colorMode: "along",
    }),
    preset("spirograph", {
      background: "#0b1020",
      palette: ["#fbbf24", "#f472b6", "#60a5fa"],
      curve: "spiro",
      lines: 36,
      petals: 7,
      frequency: 13,
      amplitude: 0.4,
      inner: 0.3,
      outer: 0.95,
      lineWidth: 0.7,
      colorMode: "along",
    }),
    preset("seal", {
      background: "#f8fafc",
      palette: ["#7f1d1d", "#b91c1c"],
      curve: "harmonic",
      lines: 18,
      petals: 24,
      frequency: 6,
      amplitude: 0.35,
      inner: 0.45,
      outer: 0.95,
      lineWidth: 0.9,
      colorMode: "blend",
    }),
    preset("lace", {
      background: "transparent",
      palette: ["#334155", "#64748b"],
      curve: "weave",
      lines: 16,
      petals: 8,
      frequency: 16,
      amplitude: 0.9,
      inner: 0.12,
      outer: 0.9,
      lineWidth: 0.8,
      colorMode: "single",
    }),
    preset("ribbon", {
      background: "#f0f9ff",
      palette: ["#0369a1", "#0d9488"],
      layout: "band",
      repeats: 6,
      inner: 0.3,
      outer: 0.7,
      curve: "spiro",
      lines: 16,
      petals: 3,
      frequency: 2,
      amplitude: 0.5,
      lineWidth: 1,
      colorMode: "iris",
      gradientAngle: 90,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.layout, COMMON_GROUPS.shape, OVERLAY_GROUP, COMMON_GROUPS.colors],
    order: [
      "layout",
      "repeats",
      "rotation",
      "inner",
      "outer",
      "curve",
      "lines",
      "petals",
      "frequency",
      "amplitude",
      "spread",
      "lineWidth",
      "overlay",
      "overlayCurve",
      "overlayLines",
      "overlayPetals",
      "overlayFrequency",
      "overlayAmplitude",
      "overlayColor",
      "colorMode",
      "gradientAngle",
      "palette",
      "background",
    ],
    params: {
      layout: { group: "layout", optionLabelKeys: optionLabels(ID, "layout", GUILLOCHE_LAYOUTS) },
      repeats: { group: "layout", visibleWhen: notRosette },
      rotation: { group: "layout", unit: "°", visibleWhen: (p) => p.layout === "rosette" },
      inner: {
        group: "layout",
        step: 0.01,
        descriptionKey: `tools.${ID}.params.inner.description`,
      },
      outer: {
        group: "layout",
        step: 0.01,
        descriptionKey: `tools.${ID}.params.outer.description`,
      },
      curve: { group: "shape", optionLabelKeys: optionLabels(ID, "curve", GUILLOCHE_CURVES) },
      lines: { group: "shape" },
      petals: { group: "shape", descriptionKey: `tools.${ID}.params.petals.description` },
      frequency: { group: "shape", descriptionKey: `tools.${ID}.params.frequency.description` },
      amplitude: { group: "shape", step: 0.01 },
      spread: {
        group: "shape",
        step: 0.01,
        descriptionKey: `tools.${ID}.params.spread.description`,
      },
      lineWidth: { group: "shape", step: 0.05, unit: "px" },
      overlay: { group: "overlay" },
      overlayCurve: {
        group: "overlay",
        optionLabelKeys: optionLabels(ID, "curve", GUILLOCHE_CURVES),
        visibleWhen: withOverlay,
      },
      overlayLines: { group: "overlay", visibleWhen: withOverlay },
      overlayPetals: { group: "overlay", visibleWhen: withOverlay },
      overlayFrequency: { group: "overlay", visibleWhen: withOverlay },
      overlayAmplitude: { group: "overlay", step: 0.01, visibleWhen: withOverlay },
      overlayColor: { group: "overlay", visibleWhen: withOverlay },
      colorMode: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "colorMode", GUILLOCHE_COLOR_MODES),
        descriptionKey: `tools.${ID}.params.colorMode.description`,
      },
      gradientAngle: {
        group: "colors",
        unit: "°",
        visibleWhen: (p) => p.colorMode === "iris",
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const curve = rollCurve(rng);
    const band = current.layout !== "rosette";
    const inner = band ? roundTo(rng.float(0.05, 0.2), 2) : roundTo(rng.float(0.1, 0.5), 2);
    const outer = band ? roundTo(rng.float(0.8, 0.95), 2) : roundTo(rng.float(0.85, 0.97), 2);
    const next: GuillocheParams = {
      background: current.background,
      palette: randomPalette(rng, rng.int(2, 3)),
      layout: current.layout,
      repeats: current.repeats,
      rotation: current.rotation,
      inner: current.layout === "frame" ? current.inner : inner,
      outer: current.layout === "frame" ? current.outer : outer,
      curve,
      lines: rng.int(8, 40),
      petals: band ? rng.int(1, 3) : rng.int(3, 24),
      frequency: band ? rng.int(1, 4) : rng.int(2, 24),
      amplitude: roundTo(rng.float(0.2, 0.8), 2),
      spread: rng.bool(0.75) ? 1 : roundTo(rng.float(0.3, 1), 2),
      lineWidth: current.lineWidth,
      colorMode: rng.pick(GUILLOCHE_COLOR_MODES),
      gradientAngle: rng.int(0, 35) * 10,
      overlay: rng.bool(0.3),
      overlayCurve: rollCurve(rng),
      overlayLines: rng.int(6, 24),
      overlayPetals: band ? rng.int(1, 3) : rng.int(3, 16),
      overlayFrequency: band ? rng.int(1, 4) : rng.int(2, 16),
      overlayAmplitude: roundTo(rng.float(0.2, 0.8), 2),
      overlayColor: randomPalette(rng, 1)[0] ?? current.overlayColor,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width, height, t }) {
      const { lo, hi } = bandEdges(p.inner, p.outer);
      const spiroRatio = (hi - lo) / Math.max(hi + lo, 1e-6);
      const layers = [
        {
          curve: p.curve,
          lines: p.lines,
          petals: p.petals,
          frequency: p.frequency,
          amplitude: p.amplitude,
          spread: p.spread,
          spiroRatio,
          phase: 0,
        },
      ];
      if (p.overlay) {
        layers.push({
          curve: p.overlayCurve,
          lines: p.overlayLines,
          petals: p.overlayPetals,
          frequency: p.overlayFrequency,
          amplitude: p.overlayAmplitude,
          spread: p.spread,
          spiroRatio,
          // Half a line step, so the second layer falls between the first one's lines.
          phase: Math.PI / Math.max(1, p.overlayLines),
        });
      }
      return guillocheSvg({
        width,
        height,
        layout: p.layout,
        inner: p.inner,
        outer: p.outer,
        rotation: p.rotation,
        repeats: p.repeats,
        layers,
        lineWidth: p.lineWidth,
        colorMode: p.colorMode,
        colors: p.palette,
        layerColors: [p.overlayColor],
        gradientAngle: p.gradientAngle,
        background: p.background,
        ...(t !== undefined ? { t } : {}),
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  animation: GUILLOCHE_ANIMATION,
});
