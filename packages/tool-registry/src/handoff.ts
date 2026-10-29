/**
 * Workflows between tools (M5b-AP04, docs/ARCHITECTURE.md 4.18): which
 * tools take a picture from another tool ("Weiterverwenden in") and which
 * colours a colour tool saves as a brand palette ("Ins Brand Kit"). Pure;
 * the editor shell does the rendering, the hand-over and the storage.
 */
import { HEX_COLOR_PATTERN, PALETTE_MAX, PALETTE_MIN } from "./common";
import type { AnyToolDefinition } from "./types";

/** Where a handed-over picture goes in a target tool. */
export type ImageTargetSlot =
  /** An upload param (`kind: "image"`, local only). */
  | { readonly kind: "param"; readonly param: string; readonly labelKey: string }
  /** The image picker of an `imageInput` tool without a photo param (palette from image). */
  | { readonly kind: "image-input"; readonly labelKey: string };

/** A tool and one of its picture slots, as offered in the menu. */
export interface ImageTargetEntry {
  readonly toolId: string;
  readonly slot: ImageTargetSlot;
}

/** Label of the image picker of `imageInput` tools (editor messages). */
export const IMAGE_INPUT_TARGET_LABEL = "Editor.handoff.imageInputTarget";

const paramLabel = (toolId: string, param: string) => `tools.${toolId}.params.${param}.label`;

/**
 * Whether `param` can safely take a picture: an image param (`kind:
 * "image"`) that stays on the device (`localParams`), so a handed-over
 * picture never reaches a share link.
 */
export function isImageTargetParam(tool: AnyToolDefinition, param: string): boolean {
  const hints = tool.controls?.params as Record<string, { kind?: string } | undefined> | undefined;
  return (
    Object.prototype.hasOwnProperty.call(tool.schema.shape, param) &&
    hints?.[param]?.kind === "image" &&
    (tool.localParams ?? []).includes(param)
  );
}

/**
 * The picture slots of a tool, in order: `imageTargets`, then the photo
 * param of `photoSource` (if not listed), then the picker of an
 * `imageInput` tool without a photo param. Params that are no local image
 * params are left out (the registry test fails on them).
 */
export function imageTargetsOf(tool: AnyToolDefinition): ImageTargetSlot[] {
  const out: ImageTargetSlot[] = [];
  const seen = new Set<string>();
  const add = (param: string, labelKey?: string) => {
    if (seen.has(param) || !isImageTargetParam(tool, param)) return;
    seen.add(param);
    out.push({ kind: "param", param, labelKey: labelKey ?? paramLabel(tool.id, param) });
  };
  for (const target of tool.imageTargets ?? []) add(target.param, target.labelKey);
  if (tool.photoSource) add(tool.photoSource.param);
  if (tool.imageInput && !tool.photoSource) {
    out.push({ kind: "image-input", labelKey: IMAGE_INPUT_TARGET_LABEL });
  }
  return out;
}

/** Every picture slot of `tools` except those of `sourceId` itself, in tool order. */
export function listImageTargets(
  tools: readonly AnyToolDefinition[],
  sourceId: string,
): ImageTargetEntry[] {
  return tools
    .filter((tool) => tool.id !== sourceId)
    .flatMap((tool) => imageTargetsOf(tool).map((slot) => ({ toolId: tool.id, slot })));
}

/** The slot of `tool` named by a menu entry (`param`, or `null` for the image picker). */
export function findImageTarget(
  tool: AnyToolDefinition,
  param: string | null,
): ImageTargetSlot | undefined {
  return imageTargetsOf(tool).find((slot) =>
    param === null ? slot.kind === "image-input" : slot.kind === "param" && slot.param === param,
  );
}

const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/;

/** `#rgb` or `#rrggbb` (any case) as lower-case `#rrggbb`; `null` otherwise. */
function longHex(color: string): string | null {
  if (!HEX_COLOR_PATTERN.test(color)) return null;
  const lower = color.toLowerCase();
  const short = SHORT_HEX.exec(lower);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : lower;
}

/** `count` indices spread evenly over `length` items, first and last included. */
function evenIndices(length: number, count: number): number[] {
  if (count >= length) return Array.from({ length }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (length - 1)) / (count - 1)));
}

/**
 * The palette a colour tool saves into the brand kit: `paletteOutput` as
 * lower-case `#rrggbb`, without invalid entries and repeats, at most
 * `PALETTE_MAX` colours (picked evenly across a longer scale, so a Tailwind
 * scale keeps its lightest and darkest step). `null` without the hook, when
 * it throws, or below `PALETTE_MIN` distinct colours. Pure.
 */
export function brandPaletteOutput(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
): string[] | null {
  if (!tool.paletteOutput) return null;
  let raw: readonly string[];
  try {
    raw = tool.paletteOutput(params as never);
  } catch {
    return null;
  }
  const colors: string[] = [];
  for (const color of raw) {
    const hex = typeof color === "string" ? longHex(color) : null;
    if (hex !== null && !colors.includes(hex)) colors.push(hex);
  }
  if (colors.length < PALETTE_MIN) return null;
  return evenIndices(colors.length, PALETTE_MAX).map((i) => colors[i] as string);
}
