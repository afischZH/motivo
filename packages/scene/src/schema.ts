/**
 * Scene model of the social media editor (M6-AP02, docs/ARCHITECTURE.md
 * section 4.19). A scene is plain JSON: a format (canvas size), a brand
 * palette for colour slots and a list of layers from bottom to top. It is
 * validated with Zod wherever it enters (IndexedDB, import files, drafts).
 *
 * - Background: a reference to a Musterli tool (`toolId`, `toolVersion`,
 *   `params`, `seed`), rendered through that tool's own render path. Params
 *   are only checked to be a plain object here; the tool's schema
 *   (`parseToolParams`) checks them where the registry is at hand.
 * - Text, image (local upload), shape (rectangle, ellipse, line or a shape of
 *   the library) and logo (a snapshot of a brand kit logo).
 * - Every layer has a frame (top-left corner of the unrotated box, size,
 *   rotation in degrees around the box centre), visibility, lock, opacity,
 *   an optional group and resize constraints (Magic Resize, resize.ts).
 * - Colours are refs: a fixed `#rrggbb` or a slot `brand-1` ... `brand-10`
 *   into `scene.palette`, so Brand-Apply (AP05) only swaps the palette.
 * - `placeholder` marks text and pictures a template expects to be replaced.
 *
 * Uploads (image layers, logos) live in the scene only on this device
 * (IndexedDB and the user's own export file); the social editor has no
 * share link.
 */
// Namespace import keeps zod tree-shakable (see tool-registry/common.ts).
import * as z from "zod";
import { isShapeId } from "@musterli/engine";
import { fontRefSchema } from "./fonts";

/** Scene format version; bump with a migration in `parseScene`. */
export const SCENE_VERSION = 1;

/** Smallest and largest canvas edge (same bounds as tool canvases). */
export const SCENE_EDGE_MIN = 16;
export const SCENE_EDGE_MAX = 8192;
/** Layers per scene (background included) and groups per scene. */
export const SCENE_LAYERS_MAX = 100;
export const SCENE_GROUPS_MAX = 50;
/** Longest text of one text layer, longest layer or group name. */
export const TEXT_MAX_LENGTH = 2000;
export const LAYER_NAME_MAX = 80;
/** Font sizes in canvas pixels. */
export const FONT_SIZE_MIN = 4;
export const FONT_SIZE_MAX = 1000;
/** Uploaded pictures: longest raster edge and data URI length per picture. */
export const SCENE_IMAGE_MAX_EDGE = 2048;
export const SCENE_IMAGE_MAX_RASTER_LENGTH = 12_000_000;
export const SCENE_IMAGE_MAX_SVG_LENGTH = 1_048_576;
/** Pictures (image and logo layers) per scene. */
export const SCENE_IMAGES_MAX = 24;
/**
 * Characters of all pictures of a scene together (data URIs and SVG
 * markup): one scene always fits an import file (32 MB).
 */
export const SCENE_IMAGES_MAX_TOTAL_LENGTH = 24_000_000;
/** Brand palette of a scene: same bounds as tool palettes. */
export const SCENE_PALETTE_MIN = 2;
export const SCENE_PALETTE_MAX = 10;

/** Layer and group ids: short and safe (also as DOM ids and test ids). */
export const SCENE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const HEX6 = /^#[0-9a-f]{6}$/;
const HEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const SLOT = /^brand-(?:10|[1-9])$/;
const TOOL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Data URI of a re-encoded raster upload (PNG or JPEG, padded base64). */
const RASTER_HREF = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Coordinates may leave the canvas (bleeding decoration), within reason. */
const COORD_LIMIT = SCENE_EDGE_MAX * 4;

export const sceneIdSchema = z.string().regex(SCENE_ID_PATTERN);
const nameSchema = z.string().max(LAYER_NAME_MAX);

/** A fixed colour, normalised to lowercase `#rrggbb`. */
export const hexColorSchema = z
  .string()
  .regex(HEX)
  .transform((value) => normalizeHex(value) ?? value);

/** A colour slot of the scene palette (`brand-1` is the first colour). */
export const colorSlotSchema = z.string().regex(SLOT);

/** Fixed colour or palette slot. */
export const colorRefSchema = z.union([colorSlotSchema, hexColorSchema]);

export const paletteSchema = z
  .array(z.string().regex(HEX6))
  .min(SCENE_PALETTE_MIN)
  .max(SCENE_PALETTE_MAX);

export const formatSchema = z.object({
  /** Id of the size in `SOCIAL_FORMATS` (and the size catalogue), `null` for a custom size. */
  id: z.string().max(64).regex(TOOL_ID).nullable(),
  width: z.int().min(SCENE_EDGE_MIN).max(SCENE_EDGE_MAX),
  height: z.int().min(SCENE_EDGE_MIN).max(SCENE_EDGE_MAX),
});

/** Horizontal or vertical anchor of a layer (Magic Resize). */
export const ANCHORS = ["start", "center", "end", "stretch"] as const;
/** What a layer's size follows on resize: the short side, the width or the height. */
export const SIZE_MODES = ["short", "width", "height"] as const;

export const constraintsSchema = z.object({
  h: z.enum(ANCHORS),
  v: z.enum(ANCHORS),
  size: z.enum(SIZE_MODES),
  /** Decoration that may be cut off by the canvas edge on purpose. */
  bleed: z.boolean(),
});

const coord = z.number().min(-COORD_LIMIT).max(COORD_LIMIT);
const extent = z.number().positive().max(COORD_LIMIT);

const baseShape = {
  id: sceneIdSchema,
  name: nameSchema,
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
  /** Degrees around the centre of the box, -360 to 360. */
  rotation: z.number().min(-360).max(360),
  x: coord,
  y: coord,
  width: extent,
  height: extent,
  groupId: sceneIdSchema.nullable(),
  constraints: constraintsSchema,
};

/** A user's picture: sanitised SVG markup or a re-encoded PNG/JPEG data URI. */
export const sceneImageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("svg"),
    svg: z.string().min(1).max(SCENE_IMAGE_MAX_SVG_LENGTH),
    width: z.number().positive().max(1_000_000),
    height: z.number().positive().max(1_000_000),
    name: z.string().max(200),
  }),
  z.object({
    kind: z.literal("raster"),
    href: z.string().max(SCENE_IMAGE_MAX_RASTER_LENGTH).regex(RASTER_HREF),
    width: z.int().min(1).max(SCENE_IMAGE_MAX_EDGE),
    height: z.int().min(1).max(SCENE_IMAGE_MAX_EDGE),
    name: z.string().max(200),
  }),
]);

const shadowSchema = z.object({
  color: colorRefSchema,
  /** Blur radius, offsets in canvas pixels. */
  blur: z.number().min(0).max(500),
  offsetX: z.number().min(-500).max(500),
  offsetY: z.number().min(-500).max(500),
  opacity: z.number().min(0).max(1),
});

const strokeSchema = z.object({
  color: colorRefSchema,
  width: z.number().min(0).max(200),
});

/** Marker bar behind each line (text-effects.ts `highlightRects`). */
const highlightSchema = z.object({
  color: colorRefSchema,
  /** Left and right of the text; half of it above and below the em box. */
  padding: z.number().min(0).max(200),
});

/** Gradient fill of the text over its box, angle as in CSS (0 = upwards, 90 = to the right). */
const gradientSchema = z.object({
  from: colorRefSchema,
  to: colorRefSchema,
  angle: z.number().min(-360).max(360),
});

/**
 * Text effects, all drawn by the one render path (`drawScene` in the
 * editor): shadow, outline, highlight bar behind the lines and gradient
 * fill (which replaces the text colour while it is set).
 */
export const textEffectsSchema = z.object({
  shadow: shadowSchema.optional(),
  stroke: strokeSchema.optional(),
  highlight: highlightSchema.optional(),
  gradient: gradientSchema.optional(),
});

export const TEXT_ALIGNS = ["left", "center", "right"] as const;
/**
 * Font role of a text layer (M6-AP05): Brand-Apply gives `heading` texts
 * the first brand font and `body` texts the second (or the first). Layers
 * without a role get one from their size (`fontRoleOf` in brand.ts).
 */
export const FONT_ROLES = ["heading", "body"] as const;
export const TEXT_VALIGNS = ["top", "middle", "bottom"] as const;

export const textLayerSchema = z.object({
  ...baseShape,
  kind: z.literal("text"),
  text: z.string().max(TEXT_MAX_LENGTH),
  /** CSS font family list the text is drawn with (fonts.ts `fontFamilyFor`). */
  fontFamily: z.string().min(1).max(200),
  /**
   * Where the font comes from (self-hosted library font or brand font, id
   * plus name); missing for system stacks and AP02 scenes.
   */
  font: fontRefSchema.optional(),
  /** Font role for Brand-Apply; optional, so the scene version stays 1. */
  fontRole: z.enum(FONT_ROLES).optional(),
  fontSize: z.number().min(FONT_SIZE_MIN).max(FONT_SIZE_MAX),
  /** Magic Resize shrinks the text down to this size before it wraps or grows its box. */
  minFontSize: z.number().min(FONT_SIZE_MIN).max(FONT_SIZE_MAX),
  fontWeight: z.int().min(100).max(900),
  fontStyle: z.enum(["normal", "italic"]),
  /** Multiple of the font size. */
  lineHeight: z.number().min(0.7).max(3),
  /** In em. */
  letterSpacing: z.number().min(-0.2).max(1),
  align: z.enum(TEXT_ALIGNS),
  valign: z.enum(TEXT_VALIGNS),
  color: colorRefSchema,
  effects: textEffectsSchema,
  placeholder: z.boolean(),
});

export const imageLayerSchema = z.object({
  ...baseShape,
  kind: z.literal("image"),
  image: sceneImageSchema,
  /** `cover` fills the box (cropping), `contain` shows the whole picture. */
  fit: z.enum(["cover", "contain"]),
  cornerRadius: z.number().min(0).max(COORD_LIMIT),
  placeholder: z.boolean(),
});

export const SHAPE_KINDS = ["rect", "ellipse", "line", "library"] as const;

export const shapeLayerSchema = z.object({
  ...baseShape,
  kind: z.literal("shape"),
  shape: z.enum(SHAPE_KINDS),
  /** Shape of the library (`@musterli/engine` shapes) when `shape` is `library`. */
  shapeId: z
    .string()
    .max(64)
    .refine((id): boolean => isShapeId(id))
    .nullable(),
  fill: colorRefSchema.nullable(),
  stroke: colorRefSchema.nullable(),
  strokeWidth: z.number().min(0).max(500),
  cornerRadius: z.number().min(0).max(COORD_LIMIT),
});

export const logoLayerSchema = z.object({
  ...baseShape,
  kind: z.literal("logo"),
  /** Brand kit asset the logo came from; the snapshot below keeps the design intact without it. */
  assetId: z.string().max(64).nullable(),
  image: sceneImageSchema,
});

export const backgroundLayerSchema = z.object({
  ...baseShape,
  kind: z.literal("background"),
  toolId: z.string().min(1).max(64).regex(TOOL_ID),
  toolVersion: z.int().min(1).max(1_000_000),
  params: z.custom<Record<string, unknown>>(isPlainObject, { message: "Expected a plain object" }),
  seed: z.int().min(0).max(0xffffffff),
});

export const layerSchema = z.discriminatedUnion("kind", [
  backgroundLayerSchema,
  textLayerSchema,
  imageLayerSchema,
  shapeLayerSchema,
  logoLayerSchema,
]);

export const groupSchema = z.object({
  id: sceneIdSchema,
  name: nameSchema,
  constraints: constraintsSchema,
});

export const sceneSchema = z
  .object({
    version: z.literal(SCENE_VERSION),
    format: formatSchema,
    palette: paletteSchema,
    layers: z.array(layerSchema).min(0).max(SCENE_LAYERS_MAX),
    groups: z.array(groupSchema).max(SCENE_GROUPS_MAX),
  })
  .superRefine((scene, ctx) => {
    const ids = new Set<string>();
    for (const [index, layer] of scene.layers.entries()) {
      if (ids.has(layer.id)) {
        ctx.addIssue({ code: "custom", message: "Duplicate layer id", path: ["layers", index] });
      }
      ids.add(layer.id);
      if (layer.kind === "background" && index !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "The background must be the bottom layer",
          path: ["layers", index],
        });
      }
    }
    const groupIds = new Set<string>();
    for (const [index, group] of scene.groups.entries()) {
      if (groupIds.has(group.id) || ids.has(group.id)) {
        ctx.addIssue({ code: "custom", message: "Duplicate group id", path: ["groups", index] });
      }
      groupIds.add(group.id);
    }
    for (const [index, layer] of scene.layers.entries()) {
      if (layer.groupId !== null && !groupIds.has(layer.groupId)) {
        ctx.addIssue({ code: "custom", message: "Unknown group", path: ["layers", index] });
      }
      if (layer.groupId !== null && layer.kind === "background") {
        ctx.addIssue({
          code: "custom",
          message: "The background is never grouped",
          path: ["layers", index],
        });
      }
    }
    let images = 0;
    let chars = 0;
    for (const l of scene.layers) {
      if (l.kind !== "image" && l.kind !== "logo") continue;
      images++;
      chars += l.image.kind === "svg" ? l.image.svg.length : l.image.href.length;
    }
    if (images > SCENE_IMAGES_MAX) {
      ctx.addIssue({ code: "custom", message: "Too many pictures", path: ["layers"] });
    }
    if (chars > SCENE_IMAGES_MAX_TOTAL_LENGTH) {
      ctx.addIssue({ code: "custom", message: "Pictures too large together", path: ["layers"] });
    }
    // Background params hold uploads of the tool too (counted by their JSON length).
    const background = scene.layers[0];
    if (
      background?.kind === "background" &&
      JSON.stringify(background.params).length > SCENE_IMAGES_MAX_TOTAL_LENGTH
    ) {
      ctx.addIssue({ code: "custom", message: "Background too large", path: ["layers", 0] });
    }
  });

export type Scene = z.output<typeof sceneSchema>;
export type SceneFormat = z.output<typeof formatSchema>;
export type Layer = z.output<typeof layerSchema>;
export type LayerKind = Layer["kind"];
export type BackgroundLayer = z.output<typeof backgroundLayerSchema>;
export type TextLayer = z.output<typeof textLayerSchema>;
export type ImageLayer = z.output<typeof imageLayerSchema>;
export type ShapeLayer = z.output<typeof shapeLayerSchema>;
export type LogoLayer = z.output<typeof logoLayerSchema>;
export type SceneGroup = z.output<typeof groupSchema>;
export type Constraints = z.output<typeof constraintsSchema>;
export type Anchor = (typeof ANCHORS)[number];
export type SizeMode = (typeof SIZE_MODES)[number];
export type SceneImage = z.output<typeof sceneImageSchema>;
export type ColorRef = z.output<typeof colorRefSchema>;
export type TextEffects = z.output<typeof textEffectsSchema>;
export type FontRole = (typeof FONT_ROLES)[number];

/**
 * A plain object of any realm (IndexedDB and workers clone into the page's
 * realm), not an array, class instance or null.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** `#abc` or `#AABBCC` as lowercase `#aabbcc`; `null` for anything else. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

/** True for `brand-1` ... `brand-10`. */
export function isColorSlot(ref: string): boolean {
  return SLOT.test(ref);
}

/**
 * The colour a ref stands for: a slot picks from the palette (wrapping
 * around when the palette is shorter), a fixed colour stays.
 */
export function resolveColor(ref: ColorRef, palette: readonly string[]): string {
  if (!isColorSlot(ref)) return normalizeHex(ref) ?? "#000000";
  const index = Number(ref.slice("brand-".length)) - 1;
  if (palette.length === 0) return "#000000";
  return palette[index % palette.length] ?? "#000000";
}

/** Validates a scene. Never throws. */
export function parseScene(
  value: unknown,
): { success: true; data: Scene } | { success: false; error: string } {
  const parsed = sceneSchema.safeParse(value);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, error: parsed.error.message };
}
