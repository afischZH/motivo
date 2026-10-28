/**
 * M5-AP03: 3D Perspective Grid (docs/TOOLS.md D4). A retro floor grid in
 * perspective with optional ceiling, striped sun, stars, mountains, haze and
 * glow; the floor moves towards the camera in the "Motion" GIF.
 */
import { oklchToHex, perspectiveGridSvg } from "@musterli/engine";
import * as z from "zod";
import { colorSchema, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { roundTo } from "./shared";

const ID = "perspective-grid";

const schema = visualParamsSchema.extend({
  /** Horizon position in percent of the height from the top. */
  horizon: z.number().min(15).max(85),
  /** Camera roll in degrees. */
  tilt: z.number().min(-30).max(30),
  /** Field of view across the shorter edge in degrees. */
  fov: z.number().min(30).max(140),
  /** Camera height above the floor in cells. */
  cameraHeight: z.number().min(0.25).max(8),
  /** Row spacing relative to the column spacing. */
  cellDepth: z.number().min(0.25).max(4),
  /** Visible rows from the bottom edge to the far end. */
  distance: z.int().min(8).max(120),
  lineWidth: z.number().min(0.5).max(12),
  taper: z.number().min(0).max(1),
  lineColor: colorSchema,
  fade: z.number().min(0).max(1),
  glow: z.number().min(0).max(1),
  haze: z.number().min(0).max(1),
  ceiling: z.boolean(),
  sun: z.boolean(),
  /** Sun radius in percent of the shorter edge. */
  sunSize: z.number().min(5).max(60),
  /** Sun centre above the horizon in radii (negative = setting). */
  sunRise: z.number().min(-0.5).max(1.2),
  sunStripes: z.int().min(0).max(12),
  sunTop: colorSchema,
  sunBottom: colorSchema,
  /** Star density 0 to 100; 0 = off. */
  stars: z.number().min(0).max(100),
  starColor: colorSchema,
  /** Mountain height in percent of the shorter edge; 0 = off. */
  mountains: z.number().min(0).max(40),
  mountainColor: colorSchema,
});

export type PerspectiveGridParams = z.output<typeof schema>;

const defaults: PerspectiveGridParams = {
  background: "#12002b",
  palette: ["#0a0118", "#2b0a4f", "#7a1d8c", "#ff4f9a"],
  horizon: 55,
  tilt: 0,
  fov: 90,
  cameraHeight: 1.6,
  cellDepth: 1,
  distance: 40,
  lineWidth: 2.5,
  taper: 0.7,
  lineColor: "#ff3ccf",
  fade: 0.6,
  glow: 0.6,
  haze: 0.45,
  ceiling: false,
  sun: true,
  sunSize: 24,
  sunRise: 0.45,
  sunStripes: 6,
  sunTop: "#ffe66d",
  sunBottom: "#ff2a6d",
  stars: 35,
  starColor: "#ffffff",
  mountains: 0,
  mountainColor: "#1d0638",
};

const preset = (
  id: string,
  params: Partial<PerspectiveGridParams>,
): Preset<PerspectiveGridParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

const GROUPS = {
  camera: { id: "camera", labelKey: `tools.${ID}.groups.camera` },
  grid: { id: "grid", labelKey: `tools.${ID}.groups.grid` },
  scene: { id: "scene", labelKey: `tools.${ID}.groups.scene` },
  colors: { id: "colors", labelKey: "tools.common.groups.colors" },
} as const;

export const perspectiveGridTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1920, height: 1080 },
  presets: [
    preset("synthwave", {}),
    preset("terminal", {
      background: "#000000",
      palette: ["#000000", "#001a07"],
      lineColor: "#33ff66",
      horizon: 50,
      ceiling: true,
      sun: false,
      stars: 0,
      haze: 0.25,
      glow: 0.7,
      lineWidth: 2,
      taper: 0.4,
      cameraHeight: 1,
      distance: 60,
    }),
    preset("ice", {
      background: "#e9f3fb",
      palette: ["#7fb8e6", "#cfe6f7", "#f6fbff"],
      lineColor: "#2f7fc1",
      sunTop: "#ffffff",
      sunBottom: "#a9d3f2",
      sunStripes: 0,
      sunSize: 18,
      sunRise: 0.2,
      stars: 0,
      glow: 0.25,
      haze: 0.7,
      mountains: 14,
      mountainColor: "#9cc4e4",
      lineWidth: 1.5,
      fov: 80,
    }),
    preset("sunset", {
      background: "#2a0d2e",
      palette: ["#2b1055", "#a4295b", "#f06b3f", "#ffc65c"],
      lineColor: "#ffb347",
      sunTop: "#fff3b0",
      sunBottom: "#ff6b35",
      sunSize: 34,
      sunRise: 0.1,
      sunStripes: 8,
      stars: 10,
      mountains: 12,
      mountainColor: "#3a0f3d",
      horizon: 62,
      glow: 0.5,
    }),
    preset("mono", {
      background: "#ffffff",
      palette: ["#ffffff", "#ffffff"],
      lineColor: "#111111",
      sun: false,
      stars: 0,
      glow: 0,
      haze: 0,
      fade: 0.8,
      lineWidth: 1.5,
      taper: 1,
      cameraHeight: 2.5,
      fov: 70,
      horizon: 40,
    }),
    preset("blueprint", {
      background: "#0b3a75",
      palette: ["#0b3a75", "#0e4a8f"],
      lineColor: "#d8ecff",
      sun: false,
      stars: 0,
      glow: 0,
      haze: 0.2,
      lineWidth: 1,
      taper: 0,
      fade: 0.4,
      cameraHeight: 4,
      fov: 60,
      horizon: 30,
      distance: 80,
    }),
    preset("night-drive", {
      background: "#05030f",
      palette: ["#020108", "#0d0b2e", "#3a1a6b"],
      lineColor: "#2de2e6",
      sunTop: "#f9f871",
      sunBottom: "#ff4ecd",
      sunSize: 20,
      sunRise: 0.3,
      stars: 70,
      starColor: "#e8f7ff",
      mountains: 16,
      mountainColor: "#0a0820",
      tilt: -6,
      cameraHeight: 0.8,
      fov: 100,
      cellDepth: 1.5,
      haze: 0.35,
    }),
    preset("tunnel", {
      background: "#0d001a",
      palette: ["#0d001a", "#4c1590"],
      lineColor: "#b967ff",
      ceiling: true,
      sun: false,
      stars: 0,
      haze: 0.6,
      horizon: 50,
      fov: 110,
      cameraHeight: 1.2,
      distance: 70,
      glow: 0.8,
    }),
  ],
  controls: {
    groups: [GROUPS.camera, GROUPS.grid, GROUPS.scene, GROUPS.colors],
    order: [
      "horizon",
      "tilt",
      "fov",
      "cameraHeight",
      "cellDepth",
      "distance",
      "lineWidth",
      "taper",
      "fade",
      "glow",
      "ceiling",
      "sun",
      "sunSize",
      "sunRise",
      "sunStripes",
      "stars",
      "mountains",
      "haze",
      "palette",
      "background",
      "lineColor",
      "sunTop",
      "sunBottom",
      "starColor",
      "mountainColor",
    ],
    params: {
      horizon: { group: "camera", step: 1, unit: "%" },
      tilt: { group: "camera", step: 1, unit: "°" },
      fov: { group: "camera", step: 1, unit: "°" },
      cameraHeight: {
        group: "camera",
        step: 0.05,
        descriptionKey: `tools.${ID}.params.cameraHeight.description`,
      },
      cellDepth: { group: "grid", step: 0.05 },
      distance: { group: "grid" },
      lineWidth: { group: "grid", step: 0.25, unit: "px" },
      taper: { group: "grid", step: 0.01 },
      fade: { group: "grid", step: 0.01 },
      glow: { group: "grid", step: 0.01 },
      ceiling: { group: "grid" },
      sun: { group: "scene" },
      sunSize: { group: "scene", step: 1, unit: "%", visibleWhen: (p) => p.sun },
      sunRise: { group: "scene", step: 0.05, visibleWhen: (p) => p.sun },
      sunStripes: { group: "scene", visibleWhen: (p) => p.sun },
      stars: { group: "scene", step: 1 },
      mountains: { group: "scene", step: 1, unit: "%" },
      haze: { group: "scene", step: 0.01 },
      palette: { group: "colors", labelKey: `tools.${ID}.params.palette.label` },
      background: { group: "colors", labelKey: `tools.${ID}.params.background.label` },
      lineColor: { group: "colors" },
      sunTop: { group: "colors", visibleWhen: (p) => p.sun },
      sunBottom: { group: "colors", visibleWhen: (p) => p.sun },
      starColor: { group: "colors", visibleWhen: (p) => p.stars > 0 },
      mountainColor: { group: "colors", visibleWhen: (p) => p.mountains > 0 },
    },
  },
  randomize(rng, current, locks) {
    // A neon theme around one hue: dark sky ramp, darker floor, bright lines.
    const hue = rng.float(0, 360);
    const accent = (hue + rng.pick([150, 180, 200, 300])) % 360;
    const count = rng.int(2, 4);
    const palette = Array.from({ length: count }, (_, i) => {
      const t = count > 1 ? i / (count - 1) : 0;
      return oklchToHex({ l: 0.12 + 0.5 * t * t, c: 0.05 + 0.15 * t, h: (hue + 40 * t) % 360 });
    });
    const next: PerspectiveGridParams = {
      ...current,
      palette,
      background: oklchToHex({ l: 0.13, c: 0.06, h: hue }),
      lineColor: oklchToHex({ l: 0.75, c: 0.2, h: accent }),
      sunTop: oklchToHex({ l: 0.92, c: 0.15, h: rng.float(70, 105) }),
      sunBottom: oklchToHex({ l: 0.65, c: 0.24, h: rng.float(0, 30) }),
      mountainColor: oklchToHex({ l: 0.18, c: 0.06, h: hue }),
      horizon: rng.int(40, 65),
      fov: rng.int(60, 120),
      cameraHeight: roundTo(rng.float(0.6, 3), 2),
      cellDepth: roundTo(rng.float(0.6, 2), 2),
      glow: roundTo(rng.float(0.2, 0.9), 2),
      haze: roundTo(rng.float(0, 0.7), 2),
      sun: rng.bool(0.75),
      sunSize: rng.int(14, 36),
      sunRise: roundTo(rng.float(-0.1, 0.8), 2),
      sunStripes: rng.bool(0.8) ? rng.int(3, 9) : 0,
      stars: rng.bool(0.6) ? rng.int(10, 80) : 0,
      mountains: rng.bool(0.4) ? rng.int(6, 20) : 0,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height, t }) {
      return perspectiveGridSvg({
        width,
        height,
        rng,
        sky: p.palette,
        ground: p.background,
        horizon: p.horizon / 100,
        tilt: p.tilt,
        fov: p.fov,
        cameraHeight: p.cameraHeight,
        cellDepth: p.cellDepth,
        distance: p.distance,
        lineWidth: p.lineWidth,
        taper: p.taper,
        lineColor: p.lineColor,
        fade: p.fade,
        glow: p.glow,
        haze: p.haze,
        ceiling: p.ceiling,
        sun: p.sun,
        sunSize: p.sunSize / 100,
        sunRise: p.sunRise,
        sunStripes: p.sunStripes,
        sunColors: [p.sunTop, p.sunBottom],
        stars: p.stars / 100,
        starColor: p.starColor,
        mountains: p.mountains / 100,
        mountainColor: p.mountainColor,
        ...(t !== undefined ? { t } : {}),
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  animation: { sources: ["time", "seeds", "colors"] },
});
