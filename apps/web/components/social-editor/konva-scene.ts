/**
 * Draws a scene into a Konva layer. The one render path of the social
 * editor: the stage (preview) and the export build their nodes with this
 * function from the same scene and pictures, so the export looks exactly
 * like the preview. The background is a bitmap rendered by the tool's own
 * render path (resources.ts); everything else is drawn by Konva.
 */
import { shapePath } from "@musterli/engine";
import {
  resolveColor,
  type ColorRef,
  type Layer,
  type Scene,
  type TextLayer,
} from "@musterli/scene";
import type { Context as KonvaContext } from "konva/lib/Context";
import type { Layer as KonvaLayer } from "konva/lib/Layer";
import type { Node as KonvaNode } from "konva/lib/Node";
import type { Shape as KonvaShape } from "konva/lib/Shape";

import type { KonvaKit } from "./konva";

export interface ScenePictures {
  /** The background bitmap (any resolution, drawn over the whole canvas); `null` while it renders. */
  background: CanvasImageSource | null;
  /** Decoded pictures of image and logo layers, by layer id. */
  images: ReadonlyMap<string, CanvasImageSource & { width: number; height: number }>;
}

export interface DrawOptions {
  /** Editor stage: unlocked layers are draggable and listen to the pointer. */
  interactive: boolean;
}

/** Konva font style: `italic 700`, `700`. */
export function konvaFontStyle(layer: Pick<TextLayer, "fontStyle" | "fontWeight">): string {
  return `${layer.fontStyle === "italic" ? "italic " : ""}${layer.fontWeight}`;
}

const path2dCache = new Map<string, Path2D>();

function libraryPath(id: string): Path2D | null {
  let path = path2dCache.get(id);
  if (!path) {
    const d = shapePath(id, "box");
    if (!d) return null;
    path = new Path2D(d);
    path2dCache.set(id, path);
  }
  return path;
}

/** Where a picture lands inside its box (`cover` crops, `contain` letterboxes). */
export function pictureFit(
  fit: "cover" | "contain",
  box: { width: number; height: number },
  picture: { width: number; height: number },
) {
  const boxRatio = box.width / box.height;
  const picRatio = picture.width / picture.height;
  if (fit === "contain") {
    const k = Math.min(box.width / picture.width, box.height / picture.height);
    const width = picture.width * k;
    const height = picture.height * k;
    return { width, height, crop: null };
  }
  // cover: crop the picture to the box's aspect ratio, centred.
  if (picRatio > boxRatio) {
    const w = picture.height * boxRatio;
    return {
      width: box.width,
      height: box.height,
      crop: { x: (picture.width - w) / 2, y: 0, width: w, height: picture.height },
    };
  }
  const h = picture.width / boxRatio;
  return {
    width: box.width,
    height: box.height,
    crop: { x: 0, y: (picture.height - h) / 2, width: picture.width, height: h },
  };
}

function nodeFor(
  kit: KonvaKit,
  layer: Layer,
  scene: Scene,
  pictures: ScenePictures,
  options: DrawOptions,
): KonvaNode | null {
  const color = (ref: ColorRef | null) =>
    ref === null ? undefined : resolveColor(ref, scene.palette);
  const w = layer.width;
  const h = layer.height;
  const common = {
    id: layer.id,
    name: "scene-layer",
    x: layer.x + w / 2,
    y: layer.y + h / 2,
    offsetX: w / 2,
    offsetY: h / 2,
    width: w,
    height: h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    listening: options.interactive && layer.kind !== "background",
    draggable: options.interactive && !layer.locked && layer.kind !== "background",
  };
  switch (layer.kind) {
    case "background": {
      const { width, height } = scene.format;
      const base = { ...common, x: 0, y: 0, offsetX: 0, offsetY: 0, width, height, rotation: 0 };
      return pictures.background
        ? new kit.Image({ ...base, image: pictures.background })
        : new kit.Rect({ ...base, fill: "#e5e7eb" });
    }
    case "text": {
      const e = layer.effects;
      return new kit.Text({
        ...common,
        text: layer.text,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontStyle: konvaFontStyle(layer),
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing * layer.fontSize,
        align: layer.align,
        verticalAlign: layer.valign,
        wrap: "word",
        padding: 0,
        fill: color(layer.color) ?? "#000000",
        ...(e.stroke && e.stroke.width > 0
          ? {
              stroke: color(e.stroke.color) ?? "#000000",
              strokeWidth: e.stroke.width,
              fillAfterStrokeEnabled: true,
            }
          : {}),
        ...(e.shadow
          ? {
              shadowColor: color(e.shadow.color) ?? "#000000",
              shadowBlur: e.shadow.blur,
              shadowOffsetX: e.shadow.offsetX,
              shadowOffsetY: e.shadow.offsetY,
              shadowOpacity: e.shadow.opacity,
            }
          : {}),
      });
    }
    case "image":
    case "logo": {
      const picture = pictures.images.get(layer.id);
      if (!picture) {
        // Still decoding: a quiet placeholder of the same size.
        return new kit.Rect({ ...common, fill: "#9ca3af", opacity: layer.opacity * 0.3 });
      }
      const fit = pictureFit(layer.kind === "image" ? layer.fit : "contain", layer, picture);
      return new kit.Image({
        ...common,
        width: fit.width,
        height: fit.height,
        offsetX: fit.width / 2,
        offsetY: fit.height / 2,
        image: picture,
        ...(fit.crop ? { crop: fit.crop } : {}),
        ...(layer.kind === "image" && layer.cornerRadius > 0
          ? { cornerRadius: layer.cornerRadius }
          : {}),
      });
    }
    case "shape": {
      const fill = color(layer.fill);
      const stroke = color(layer.stroke);
      const strokeAttrs =
        stroke && layer.strokeWidth > 0 ? { stroke, strokeWidth: layer.strokeWidth } : {};
      if (layer.shape === "rect") {
        return new kit.Rect({
          ...common,
          ...(fill ? { fill } : {}),
          ...strokeAttrs,
          cornerRadius: Math.min(layer.cornerRadius, w / 2, h / 2),
        });
      }
      if (layer.shape === "ellipse") {
        return new kit.Ellipse({
          ...common,
          offsetX: 0,
          offsetY: 0,
          radiusX: w / 2,
          radiusY: h / 2,
          ...(fill ? { fill } : {}),
          ...strokeAttrs,
        });
      }
      if (layer.shape === "line") {
        return new kit.Line({
          ...common,
          points: [0, h / 2, w, h / 2],
          stroke: stroke ?? fill ?? "#000000",
          strokeWidth: Math.max(1, layer.strokeWidth || h),
          lineCap: "round",
          hitStrokeWidth: Math.max(12, layer.strokeWidth),
        });
      }
      const path = layer.shapeId ? libraryPath(layer.shapeId) : null;
      return new kit.Konva.Shape({
        ...common,
        sceneFunc(context: KonvaContext) {
          if (!path) return;
          const c = context._context;
          c.save();
          c.scale(w / 100, h / 100);
          if (fill) {
            c.fillStyle = fill;
            c.fill(path, "nonzero");
          }
          if (stroke && layer.strokeWidth > 0) {
            c.lineWidth = (layer.strokeWidth * 100) / Math.max(1, Math.min(w, h));
            c.strokeStyle = stroke;
            c.stroke(path);
          }
          c.restore();
        },
        // The whole box is the hit area: thin shapes stay easy to pick.
        hitFunc(context: KonvaContext, shape: KonvaShape) {
          context.beginPath();
          context.rect(0, 0, w, h);
          context.closePath();
          context.fillStrokeShape(shape);
        },
      });
    }
  }
}

/** Replaces the layer's children with the scene's nodes; returns them by layer id. */
export function drawScene(
  kit: KonvaKit,
  target: KonvaLayer,
  scene: Scene,
  pictures: ScenePictures,
  options: DrawOptions,
): Map<string, KonvaNode> {
  target.destroyChildren();
  const nodes = new Map<string, KonvaNode>();
  for (const layer of scene.layers) {
    const node = nodeFor(kit, layer, scene, pictures, options);
    if (!node) continue;
    target.add(node as Parameters<KonvaLayer["add"]>[0]);
    nodes.set(layer.id, node);
  }
  return nodes;
}
