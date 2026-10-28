/**
 * Frames of animated exports (M4-AP04). Pure and deterministic: the GIF
 * exporter asks for the frame list, then renders every frame with the
 * tool's own `render` (one render path), exactly like the preview would
 * render those params and that seed.
 *
 * A tool opts in with `ToolDefinition.animation`. The generic sources need
 * no tool code:
 *  - `seeds`: same params, seed + i;
 *  - `colors`: the tool's colour params (found like the brand palette
 *    mapping, see `colorTargets`) rotate one position per `count / k`
 *    frames, blended in OKLab between positions, so the animation loops
 *    seamlessly. With fewer than two distinct colours the hue turns once
 *    around the wheel instead;
 *  - `time`: `RenderContext.t` = i / count for renderers that use it.
 */
import { hexToOklch, mixHex, oklchToHex } from "@musterli/engine";
import { colorTargets, type ColorTarget } from "./brand-palette";
import { HEX_COLOR_PATTERN } from "./common";
import type {
  AnimationFrame,
  AnimationFrameInfo,
  AnimationSource,
  AnimationSupport,
  AnyToolDefinition,
} from "./types";

/**
 * The usual opt-in: new seeds and colour cycling. A tool enables GIF export
 * with one line, `animation: SEED_AND_COLOR_ANIMATION`.
 */
export const SEED_AND_COLOR_ANIMATION = {
  sources: ["seeds", "colors"],
} as const satisfies AnimationSupport<unknown>;

/** For tools whose output does not depend on the seed (CSS patterns, gradients). */
export const COLOR_ANIMATION = {
  sources: ["colors"],
} as const satisfies AnimationSupport<unknown>;

/** Whether the tool offers animated exports at all. */
export function supportsAnimation(tool: AnyToolDefinition): boolean {
  return tool.animation !== undefined && tool.animation.sources.length > 0;
}

/** The frame sources a tool offers, in display order (empty without `animation`). */
export function animationSources(tool: AnyToolDefinition): readonly AnimationSource[] {
  return tool.animation?.sources ?? [];
}

const isHex = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOR_PATTERN.test(value);

type AnyParams = Readonly<Record<string, unknown>>;

/** One colour slot in the params: where it is and its current value. */
interface ColorSlot {
  read(params: AnyParams): string | undefined;
  write(params: Record<string, unknown>, value: string): void;
}

/** Copies the containers a slot writes into, so writes never touch the input. */
function cloneForWrite(
  params: AnyParams,
  targets: readonly ColorTarget[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...params };
  for (const target of targets) {
    const key = target.type === "item-color" ? target.list : target.key;
    const value = params[key];
    if (target.type === "palette" && Array.isArray(value)) next[key] = [...(value as unknown[])];
    if (target.type === "item-color" && Array.isArray(value)) {
      next[key] = (value as unknown[]).map((item) =>
        typeof item === "object" && item !== null ? { ...(item as object) } : item,
      );
    }
  }
  return next;
}

/** Colour slots of the params in the order of `colorTargets` (hex values only). */
function colorSlots(params: AnyParams, targets: readonly ColorTarget[]): ColorSlot[] {
  const slots: ColorSlot[] = [];
  const itemFields = new Map<string, string[]>();
  for (const target of targets) {
    if (target.type === "palette") {
      const list = params[target.key];
      if (!Array.isArray(list)) continue;
      list.forEach((value: unknown, i) => {
        if (!isHex(value)) return;
        slots.push({
          read: (p) => (p[target.key] as string[] | undefined)?.[i],
          write: (p, v) => {
            (p[target.key] as string[])[i] = v;
          },
        });
      });
    } else if (target.type === "color") {
      if (!isHex(params[target.key])) continue;
      slots.push({
        read: (p) => p[target.key] as string,
        write: (p, v) => {
          p[target.key] = v;
        },
      });
    } else {
      const fields = itemFields.get(target.list) ?? [];
      fields.push(target.field);
      itemFields.set(target.list, fields);
    }
  }
  // Item colours item by item, like the brand palette mapping.
  for (const [list, fields] of itemFields) {
    const items = params[list];
    if (!Array.isArray(items)) continue;
    items.forEach((item: unknown, i) => {
      if (typeof item !== "object" || item === null) return;
      for (const field of fields) {
        if (!isHex((item as Record<string, unknown>)[field])) continue;
        slots.push({
          read: (p) => ((p[list] as Record<string, unknown>[])[i] as Record<string, string>)[field],
          write: (p, v) => {
            ((p[list] as Record<string, unknown>[])[i] as Record<string, unknown>)[field] = v;
          },
        });
      }
    });
  }
  return slots;
}

/** The colours `colors` frames rotate through, in slot order. */
export function cycleColors(tool: AnyToolDefinition, params: AnyParams): string[] {
  const targets = colorTargets(tool);
  return colorSlots(params, targets).map((slot) => slot.read(params) as string);
}

/**
 * Colours of frame `index` of `count`: every slot moves `k * index / count`
 * positions along the cycle (k = number of slots), blended between the two
 * neighbouring positions. Frame 0 returns the input unchanged.
 */
export function rotateColors(colors: readonly string[], index: number, count: number): string[] {
  const k = colors.length;
  if (k === 0 || index % count === 0) return [...colors];
  const t = (index % count) / count;
  const distinct = new Set(colors.map((c) => c.toLowerCase())).size;
  if (distinct < 2) {
    // One colour (or all the same): turn the hue once around the wheel.
    return colors.map((c) => {
      const lch = hexToOklch(c);
      if (Number.isNaN(lch.h)) return c;
      return oklchToHex({ l: lch.l, c: lch.c, h: (lch.h + 360 * t) % 360 });
    });
  }
  const phase = k * t;
  const step = Math.floor(phase);
  const frac = phase - step;
  return colors.map((_, j) => {
    const a = colors[(j + step) % k] as string;
    if (frac === 0) return a;
    const b = colors[(j + step + 1) % k] as string;
    return mixHex(a, b, frac, "oklab");
  });
}

/** Params of a colour-cycle frame: the rotated colours written back into a copy. */
export function colorCycleParams<P>(
  tool: AnyToolDefinition,
  params: P,
  index: number,
  count: number,
): P {
  const source = params as AnyParams;
  const targets = colorTargets(tool);
  const slots = colorSlots(source, targets);
  if (slots.length === 0 || index % count === 0) return params;
  const colors = rotateColors(
    slots.map((slot) => slot.read(source) as string),
    index,
    count,
  );
  const next = cloneForWrite(source, targets);
  slots.forEach((slot, i) => slot.write(next, colors[i] as string));
  return next as P;
}

/** Frame `index` of `count` for one source. */
function frameOf<P>(
  tool: AnyToolDefinition,
  params: P,
  seed: number,
  source: AnimationSource,
  info: AnimationFrameInfo,
): AnimationFrame<P> {
  switch (source) {
    case "seeds":
      return { params, seed: (seed + info.index) >>> 0 };
    case "colors":
      return { params: colorCycleParams(tool, params, info.index, info.count), seed };
    case "time":
      return { params, seed, t: info.t };
    case "custom": {
      const frame = tool.animation?.frame;
      if (!frame) throw new Error(`Tool "${tool.id}" has no custom animation frames`);
      // Untyped at this level: the tool's own params type.
      return (frame as (p: P, i: AnimationFrameInfo) => AnimationFrame<P>)(params, info);
    }
  }
}

/**
 * The frames of an animation, in order. `count` is clamped to at least 1;
 * the caller limits the maximum (export budget). Throws when the tool does
 * not offer `source`.
 */
export function planAnimationFrames<P>(
  tool: AnyToolDefinition,
  params: P,
  seed: number,
  source: AnimationSource,
  count: number,
): AnimationFrame<P>[] {
  if (!animationSources(tool).includes(source)) {
    throw new Error(`Tool "${tool.id}" does not offer the animation source "${source}"`);
  }
  const n = Math.max(1, Math.floor(count));
  const base = seed >>> 0;
  const frames: AnimationFrame<P>[] = [];
  for (let index = 0; index < n; index++) {
    frames.push(frameOf(tool, params, base, source, { index, count: n, t: index / n, seed: base }));
  }
  return frames;
}
