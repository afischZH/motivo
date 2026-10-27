/**
 * Shared schema building blocks for tool params and design state.
 *
 * Tool params extend `visualParamsShape` (background + palette). Canvas size
 * and seed are deliberately not part of the params: they are stored as
 * separate design columns and reach the renderer via `RenderContext`.
 */
// Namespace import on purpose: `import { z }` defeats tree shaking and pulls in
// all zod locales (about 92 KB gzip instead of about 27 KB).
import * as z from "zod";
import type { CanvasSize, ControlKind } from "./types";

/**
 * Maps shared schemas to the control kind the editor should use, so tools do
 * not have to repeat `kind: "color"` for every colour param. Lookups are by
 * schema identity: wrapping a schema (`.optional()`, `.default()`) creates a
 * new instance that is not registered, use `ControlHints` there.
 */
export const controlKindRegistry = z.registry<{ kind: ControlKind }>();

/** `#rgb` or `#rrggbb`, case-insensitive. No alpha: SVG editors handle it poorly. */
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

export const colorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, { message: "Expected a hex colour like #1e90ff" })
  .register(controlKindRegistry, { kind: "color" });

export const PALETTE_MIN = 2;
export const PALETTE_MAX = 10;

export const paletteSchema = z
  .array(colorSchema)
  .min(PALETTE_MIN)
  .max(PALETTE_MAX)
  .register(controlKindRegistry, { kind: "palette" });

export const TRANSPARENT = "transparent";

/** A solid colour or `"transparent"`. */
export const backgroundSchema = z
  .union([z.literal(TRANSPARENT), colorSchema])
  .register(controlKindRegistry, { kind: "background" });

/** Smallest and largest canvas edge in CSS pixels (8K is 7680). */
export const CANVAS_EDGE_MIN = 16;
export const CANVAS_EDGE_MAX = 8192;

export const canvasEdgeSchema = z.int().min(CANVAS_EDGE_MIN).max(CANVAS_EDGE_MAX);

export const canvasSizeSchema = z.object({
  width: canvasEdgeSchema,
  height: canvasEdgeSchema,
});

export const DEFAULT_CANVAS_SIZE: Readonly<CanvasSize> = { width: 1080, height: 1080 };

/** Unsigned 32-bit integer seed. */
export const seedSchema = z.uint32();

/** Params every visual tool shares. Spread into `z.object({ ...visualParamsShape, ... })`. */
export const visualParamsShape = {
  background: backgroundSchema,
  palette: paletteSchema,
} as const;

/** Base object schema for visual tools; extend with `.extend({ ... })`. */
export const visualParamsSchema = z.object(visualParamsShape);

/** Size-picker groups from docs/TOOLS.md (Social, Desktop, Mobile, A4). */
export type SizePresetGroup = "social" | "desktop" | "mobile" | "print";

export interface SizePreset extends CanvasSize {
  id: string;
  group: SizePresetGroup;
  /** i18n key of the display name. */
  nameKey: string;
}

function size(id: string, group: SizePresetGroup, width: number, height: number): SizePreset {
  return { id, group, width, height, nameKey: `sizes.${id}` };
}

/** Common output sizes. Values are public platform/paper dimensions (A4 at 300 dpi). */
export const SIZE_PRESETS: readonly SizePreset[] = [
  size("square", "social", 1080, 1080),
  size("portrait", "social", 1080, 1350),
  size("story", "social", 1080, 1920),
  size("landscape", "social", 1200, 630),
  size("banner", "social", 1500, 500),
  size("full-hd", "desktop", 1920, 1080),
  size("qhd", "desktop", 2560, 1440),
  size("uhd-4k", "desktop", 3840, 2160),
  size("phone", "mobile", 1170, 2532),
  size("tablet", "mobile", 2048, 2732),
  size("a4-portrait", "print", 2480, 3508),
  size("a4-landscape", "print", 3508, 2480),
];
