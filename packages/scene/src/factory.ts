/**
 * New layers and scenes with sensible defaults, placed relative to the
 * format (sizes in fractions of the short side) and with constraints
 * inferred from where they land.
 */
import { inferConstraints } from "./constraints";
import { sceneFormat } from "./formats";
import type {
  BackgroundLayer,
  ImageLayer,
  Layer,
  LogoLayer,
  Scene,
  SceneFormat,
  SceneImage,
  ShapeLayer,
  TextLayer,
} from "./schema";
import { SCENE_VERSION } from "./schema";

/** System font stack until AP03 brings self-hosted fonts. */
export const DEFAULT_FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Neutral starting palette for colour slots (brand-1 ... brand-5). */
export const DEFAULT_SCENE_PALETTE = ["#1f2937", "#f97316", "#fef3c7", "#0ea5e9", "#ffffff"];

const base = (id: string, name: string, format: SceneFormat, box: Box4) => ({
  id,
  name,
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
  ...box,
  groupId: null,
  constraints: inferConstraints(box, format),
});

interface Box4 {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A centred box of `w` x `h` fractions of the short side. */
function centredBox(format: SceneFormat, w: number, h: number): Box4 {
  const s = Math.min(format.width, format.height);
  const width = s * w;
  const height = s * h;
  return { x: (format.width - width) / 2, y: (format.height - height) / 2, width, height };
}

export function createBackgroundLayer(
  id: string,
  format: SceneFormat,
  tool: { id: string; version: number; params: Record<string, unknown> },
  seed = 1,
  name = "",
): BackgroundLayer {
  return {
    ...base(id, name, format, { x: 0, y: 0, width: format.width, height: format.height }),
    constraints: { h: "stretch", v: "stretch", size: "short", bleed: false },
    kind: "background",
    toolId: tool.id,
    toolVersion: tool.version,
    params: tool.params,
    seed,
  };
}

export function createTextLayer(
  id: string,
  format: SceneFormat,
  text: string,
  options: Partial<Pick<TextLayer, "fontSize" | "fontWeight" | "color" | "align" | "name">> = {},
): TextLayer {
  const s = Math.min(format.width, format.height);
  const fontSize = options.fontSize ?? Math.round(s * 0.08);
  const box = centredBox(format, 0.8, (fontSize * 1.2 * 2) / s);
  return {
    ...base(id, options.name ?? "", format, box),
    kind: "text",
    text,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize,
    minFontSize: Math.max(8, Math.round(fontSize * 0.4)),
    fontWeight: options.fontWeight ?? 700,
    fontStyle: "normal",
    lineHeight: 1.2,
    letterSpacing: 0,
    align: options.align ?? "center",
    valign: "middle",
    color: options.color ?? "brand-1",
    effects: {},
    placeholder: false,
  };
}

export function createShapeLayer(
  id: string,
  format: SceneFormat,
  shape: ShapeLayer["shape"],
  shapeId: string | null = null,
  name = "",
): ShapeLayer {
  const box = shape === "line" ? centredBox(format, 0.5, 0.01) : centredBox(format, 0.3, 0.3);
  return {
    ...base(id, name, format, box),
    kind: "shape",
    shape,
    shapeId: shape === "library" ? shapeId : null,
    fill: shape === "line" ? null : "brand-2",
    stroke: shape === "line" ? "brand-1" : null,
    strokeWidth:
      shape === "line" ? Math.max(2, Math.round(Math.min(format.width, format.height) * 0.008)) : 0,
    cornerRadius: 0,
  };
}

/** A picture box of at most 60 % of the short side with the picture's aspect ratio. */
function pictureBox(format: SceneFormat, image: SceneImage, share = 0.6): Box4 {
  const s = Math.min(format.width, format.height) * share;
  const k = Math.min(s / image.width, s / image.height);
  return centredBox(
    format,
    (image.width * k) / Math.min(format.width, format.height),
    (image.height * k) / Math.min(format.width, format.height),
  );
}

export function createImageLayer(
  id: string,
  format: SceneFormat,
  image: SceneImage,
  name = "",
): ImageLayer {
  return {
    ...base(id, name || image.name, format, pictureBox(format, image)),
    kind: "image",
    image,
    fit: "cover",
    cornerRadius: 0,
    placeholder: false,
  };
}

export function createLogoLayer(
  id: string,
  format: SceneFormat,
  image: SceneImage,
  assetId: string | null,
  name = "",
): LogoLayer {
  const box = pictureBox(format, image, 0.2);
  const s = Math.min(format.width, format.height);
  // Logos start in the bottom right corner with a margin of 5 % of the short side.
  const placed = {
    ...box,
    x: format.width - box.width - s * 0.05,
    y: format.height - box.height - s * 0.05,
  };
  return {
    ...base(id, name || image.name, format, placed),
    kind: "logo",
    assetId,
    image,
  };
}

/** An empty scene in a format, optionally with a background layer. */
export function createScene(formatId: string, layers: Layer[] = []): Scene {
  return {
    version: SCENE_VERSION,
    format: sceneFormat(formatId),
    palette: [...DEFAULT_SCENE_PALETTE],
    layers,
    groups: [],
  };
}
