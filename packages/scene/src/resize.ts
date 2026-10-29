/**
 * Magic Resize: a scene in another format, from the constraints of each
 * layer (or group). Pure; text is measured through the injected
 * `TextMeasure`.
 *
 * Per unit (an ungrouped layer, or a group as one box around its members):
 *  - Size: scales with the short side, the width or the height of the
 *    canvas (`constraints.size`).
 *  - Anchor per axis: `start` keeps the distance to the left/top edge,
 *    `end` to the right/bottom edge, `center` the offset from the canvas
 *    centre, `stretch` both distances (the box grows or shrinks with the
 *    canvas). Distances scale with the short side, so margins look the same
 *    in every format.
 *  - Text: the font scales like the box, then shrinks (down to
 *    `minFontSize`) until it fits; if it still does not fit, the box grows
 *    (keeping its anchor). Text is never cut off: it shrinks further rather
 *    than leave the canvas.
 *  - Everything except `bleed` decoration ends up inside the canvas: a
 *    unit too large is scaled down around its centre, then moved inside.
 * The background always covers the whole canvas.
 */
import { boundsOf, frameOf, unionBoxes, type Box, type Frame } from "./geometry";
import type { Constraints, Layer, Scene, SceneFormat, TextLayer } from "./schema";
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from "./schema";
import { fitText, textStyleOf, type TextMeasure } from "./text";

export interface ResizeOptions {
  measure: TextMeasure;
}

interface Scales {
  short: number;
  width: number;
  height: number;
}

/** A layer's own box mapped into the new format. */
function placeAxis(
  start: number,
  size: number,
  oldExtent: number,
  newExtent: number,
  anchor: Constraints["h"],
  scaled: number,
  margin: number,
): { start: number; size: number } {
  const before = start;
  const after = oldExtent - (start + size);
  switch (anchor) {
    case "start":
      return { start: before * margin, size: scaled };
    case "end":
      return { start: newExtent - after * margin - scaled, size: scaled };
    case "stretch": {
      const s0 = before * margin;
      const s1 = newExtent - after * margin;
      // A box that would collapse falls back to centring at its scaled size.
      if (s1 - s0 >= scaled * 0.25 && s1 > s0) return { start: s0, size: s1 - s0 };
      return placeAxis(start, size, oldExtent, newExtent, "center", scaled, margin);
    }
    case "center": {
      const offset = start + size / 2 - oldExtent / 2;
      return { start: newExtent / 2 + offset * margin - scaled / 2, size: scaled };
    }
  }
}

function sizeScale(constraints: Constraints, k: Scales): number {
  return constraints.size === "width"
    ? k.width
    : constraints.size === "height"
      ? k.height
      : k.short;
}

/** New box of a unit with the given frame (unrotated box) and constraints. */
function placeBox(
  box: Box,
  constraints: Constraints,
  from: SceneFormat,
  to: SceneFormat,
  k: Scales,
) {
  const s = sizeScale(constraints, k);
  const h = placeAxis(
    box.x,
    box.width,
    from.width,
    to.width,
    constraints.h,
    box.width * s,
    k.short,
  );
  const v = placeAxis(
    box.y,
    box.height,
    from.height,
    to.height,
    constraints.v,
    box.height * s,
    k.short,
  );
  return { box: { x: h.start, y: v.start, width: h.size, height: v.size }, scale: s };
}

const clampFont = (size: number) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size));

/** Scales the size-dependent properties of a layer (fonts, strokes, radii, effects). */
function scaleDetails<L extends Layer>(layer: L, f: number): L {
  if (layer.kind === "text") {
    const e = layer.effects;
    return {
      ...layer,
      fontSize: clampFont(layer.fontSize * f),
      minFontSize: clampFont(Math.min(layer.minFontSize * f, layer.fontSize * f)),
      effects: {
        ...e,
        ...(e.shadow
          ? {
              shadow: {
                ...e.shadow,
                blur: Math.min(500, e.shadow.blur * f),
                offsetX: Math.max(-500, Math.min(500, e.shadow.offsetX * f)),
                offsetY: Math.max(-500, Math.min(500, e.shadow.offsetY * f)),
              },
            }
          : {}),
        ...(e.stroke ? { stroke: { ...e.stroke, width: Math.min(200, e.stroke.width * f) } } : {}),
        ...(e.highlight
          ? { highlight: { ...e.highlight, padding: Math.min(200, e.highlight.padding * f) } }
          : {}),
      },
    };
  }
  if (layer.kind === "shape") {
    return {
      ...layer,
      strokeWidth: Math.min(500, layer.strokeWidth * f),
      cornerRadius: layer.cornerRadius * f,
    };
  }
  if (layer.kind === "image") return { ...layer, cornerRadius: layer.cornerRadius * f };
  return layer;
}

function withFrame<L extends Layer>(layer: L, frame: Box): L {
  return {
    ...layer,
    x: frame.x,
    y: frame.y,
    width: Math.max(1, frame.width),
    height: Math.max(1, frame.height),
  };
}

/**
 * Fits a text layer into its box: shrinks the font, then grows the box
 * height (keeping the vertical anchor) when needed. `canvasHeight` bounds
 * the box. Exported for the editor (after typing).
 */
export function fitTextLayer(
  layer: TextLayer,
  measure: TextMeasure,
  canvasHeight: number,
  anchor: Constraints["v"] = layer.constraints.v,
): TextLayer {
  const fit = fitText(
    layer.text,
    textStyleOf(layer),
    layer.width,
    layer.height,
    layer.minFontSize,
    measure,
    canvasHeight,
  );
  let { y, height } = layer;
  if (!fit.fits && fit.height > height) {
    const grown = Math.min(fit.height, canvasHeight);
    if (anchor === "end") y = y + height - grown;
    else if (anchor === "center" || anchor === "stretch") y = y + height / 2 - grown / 2;
    height = grown;
  }
  return {
    ...layer,
    y,
    height,
    fontSize: fit.fontSize,
    minFontSize: Math.min(layer.minFontSize, fit.fontSize),
  };
}

/**
 * A text layer after the user edited it (typed, picked a size, dragged a
 * side): the font stays as chosen and the box grows to the text's height
 * (keeping its vertical anchor, then moved inside the canvas). Only when a
 * word is wider than the box or the text is taller than the canvas does it
 * fall back to `fitTextLayer`, which shrinks the font. Never cuts text.
 */
export function settleTextLayer(
  layer: TextLayer,
  measure: TextMeasure,
  canvas: Pick<SceneFormat, "width" | "height">,
): TextLayer {
  const layout = measure.layout(layer.text, textStyleOf(layer), layer.width);
  if (layout.overflow || layout.height > canvas.height) {
    return fitTextLayer(layer, measure, canvas.height);
  }
  if (layout.height <= layer.height) return layer;
  const height = layout.height;
  const anchor = layer.constraints.v;
  let y =
    anchor === "start"
      ? layer.y
      : anchor === "end"
        ? layer.y + layer.height - height
        : layer.y + layer.height / 2 - height / 2;
  y = Math.min(Math.max(y, 0), canvas.height - height);
  return { ...layer, y, height };
}

/** Scales a unit (frames around `center`, details by `f`). */
function scaleUnit(layers: Layer[], f: number, cx: number, cy: number): Layer[] {
  return layers.map((l) =>
    scaleDetails(
      withFrame(l, {
        x: cx + (l.x - cx) * f,
        y: cy + (l.y - cy) * f,
        width: l.width * f,
        height: l.height * f,
      }),
      f,
    ),
  );
}

function translateUnit(layers: Layer[], dx: number, dy: number): Layer[] {
  return dx === 0 && dy === 0 ? layers : layers.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }));
}

function unitBounds(layers: readonly Layer[]): Box {
  return unionBoxes(layers.map((l) => boundsOf(frameOf(l)))) ?? { x: 0, y: 0, width: 0, height: 0 };
}

/** Moves (and if needed shrinks) a unit so its rotated bounds lie in the canvas. */
function keepInside(layers: Layer[], to: SceneFormat, measure: TextMeasure, depth = 0): Layer[] {
  let out = layers;
  let b = unitBounds(out);
  if (b.width > to.width || b.height > to.height) {
    const f = Math.min(to.width / b.width, to.height / b.height) * 0.999;
    out = fitTexts(scaleUnit(out, f, b.x + b.width / 2, b.y + b.height / 2), measure, to);
    b = unitBounds(out);
  }
  const dx = b.x < 0 ? -b.x : b.x + b.width > to.width ? to.width - (b.x + b.width) : 0;
  const dy = b.y < 0 ? -b.y : b.y + b.height > to.height ? to.height - (b.y + b.height) : 0;
  out = translateUnit(out, dx, dy);
  // A text that grew while fitting can push its unit past an edge once more.
  b = unitBounds(out);
  if (depth < 3 && (b.width > to.width + 0.5 || b.height > to.height + 0.5)) {
    return keepInside(out, to, measure, depth + 1);
  }
  return out;
}

function fitTexts(layers: Layer[], measure: TextMeasure, to: SceneFormat): Layer[] {
  return layers.map((l) => (l.kind === "text" ? fitTextLayer(l, measure, to.height) : l));
}

/** One unit (a layer or a group) mapped into the new format. */
function resizeUnit(
  layers: Layer[],
  constraints: Constraints,
  from: SceneFormat,
  to: SceneFormat,
  k: Scales,
  measure: TextMeasure,
): Layer[] {
  const single = layers.length === 1 ? layers[0] : undefined;
  // A single layer is placed by its unrotated frame (rotation stays), a
  // group by the box around its members.
  const source: Box = single ? frameOf(single) : unitBounds(layers);
  const { box, scale } = placeBox(source, constraints, from, to, k);
  let placed: Layer[];
  if (single) {
    placed = [scaleDetails(withFrame(single, box), scale)];
  } else {
    const gx = source.width > 0 ? box.width / source.width : scale;
    const gy = source.height > 0 ? box.height / source.height : scale;
    placed = layers.map((l) => {
      const f: Frame = frameOf(l);
      // Members keep their aspect ratio; positions follow the group box.
      const w = f.width * scale;
      const h = f.height * scale;
      const cx = box.x + (f.x + f.width / 2 - source.x) * gx;
      const cy = box.y + (f.y + f.height / 2 - source.y) * gy;
      return scaleDetails(
        withFrame(l, { x: cx - w / 2, y: cy - h / 2, width: w, height: h }),
        scale,
      );
    });
  }
  placed = fitTexts(placed, measure, to);
  return constraints.bleed ? placed : keepInside(placed, to, measure);
}

/** The scene in `format`. Layer order, ids, groups and content stay. */
export function resizeScene(scene: Scene, format: SceneFormat, options: ResizeOptions): Scene {
  const from = scene.format;
  const to: SceneFormat = { id: format.id, width: format.width, height: format.height };
  const k: Scales = {
    short: Math.min(to.width, to.height) / Math.min(from.width, from.height),
    width: to.width / from.width,
    height: to.height / from.height,
  };
  const groups = new Map(scene.groups.map((g) => [g.id, g]));
  const done = new Map<string, Layer>();
  const handledGroups = new Set<string>();
  for (const layer of scene.layers) {
    if (layer.kind === "background") {
      done.set(layer.id, withFrame({ ...layer, rotation: 0 }, { x: 0, y: 0, ...size(to) }));
      continue;
    }
    const group = layer.groupId === null ? undefined : groups.get(layer.groupId);
    if (group) {
      if (handledGroups.has(group.id)) continue;
      handledGroups.add(group.id);
      const members = scene.layers.filter((l) => l.groupId === group.id);
      for (const l of resizeUnit(members, group.constraints, from, to, k, options.measure)) {
        done.set(l.id, l);
      }
      continue;
    }
    const [placed] = resizeUnit([layer], layer.constraints, from, to, k, options.measure);
    if (placed) done.set(placed.id, placed);
  }
  return {
    ...scene,
    format: to,
    layers: scene.layers.map((l) => done.get(l.id) ?? l),
  };
}

function size(format: SceneFormat) {
  return { width: format.width, height: format.height };
}

export interface FitProblem {
  layerId: string;
  problem: "outside" | "text-cut" | "word-overflow";
}

/**
 * Checks a scene: every visible text fits its box (no cut lines, no word
 * wider than its box) and every visible layer except `bleed` decoration
 * lies inside the canvas. Used by the Magic Resize tests and the template
 * check (AP05).
 */
export function checkSceneFit(scene: Scene, measure: TextMeasure): FitProblem[] {
  const problems: FitProblem[] = [];
  const canvas: Box = { x: 0, y: 0, width: scene.format.width, height: scene.format.height };
  const groups = new Map(scene.groups.map((g) => [g.id, g]));
  for (const layer of scene.layers) {
    if (!layer.visible || layer.kind === "background") continue;
    const bleed =
      layer.groupId !== null
        ? (groups.get(layer.groupId)?.constraints.bleed ?? false)
        : layer.constraints.bleed;
    if (!bleed) {
      const b = boundsOf(frameOf(layer));
      if (
        b.x < canvas.x - 0.5 ||
        b.y < canvas.y - 0.5 ||
        b.x + b.width > canvas.width + 0.5 ||
        b.y + b.height > canvas.height + 0.5
      ) {
        problems.push({ layerId: layer.id, problem: "outside" });
      }
    }
    if (layer.kind === "text") {
      const l = measure.layout(layer.text, textStyleOf(layer), layer.width);
      if (l.overflow) problems.push({ layerId: layer.id, problem: "word-overflow" });
      else if (l.height > layer.height + 0.5)
        problems.push({ layerId: layer.id, problem: "text-cut" });
    }
  }
  return problems;
}
