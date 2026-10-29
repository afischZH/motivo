/**
 * PNG/JPG export of a scene in its format size times `scale` (1x, 2x), and
 * the thumbnails of saved designs. Builds an off-screen Konva stage with
 * `drawScene`, the same function the editor stage uses, from the same
 * pictures; only the background is rendered again at the output size by
 * the tool's render path (in its worker), so it stays sharp. The fonts of
 * the text layers are loaded before anything is drawn (`loadSceneFonts`),
 * so even the first export never falls back to a system font. The browser
 * encodes the file asynchronously (`toBlob`).
 */
import type { Scene } from "@musterli/scene";

import { loadSceneFonts } from "./fonts";
import type { KonvaKit } from "./konva";
import { drawScene, type ScenePictures } from "./konva-scene";
import { decodePicture, renderBackground, type Picture } from "./resources";

export type SceneExportFormat = "png" | "jpg" | "webp";

const MIME: Record<SceneExportFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

/** Pictures of all image and logo layers (failed ones are left out). */
export async function scenePictures(scene: Scene): Promise<Map<string, Picture>> {
  const out = new Map<string, Picture>();
  await Promise.all(
    scene.layers.map(async (layer) => {
      if (layer.kind !== "image" && layer.kind !== "logo") return;
      try {
        out.set(layer.id, await decodePicture(layer.image));
      } catch {
        // Undecodable picture: drawn as its placeholder.
      }
    }),
  );
  return out;
}

export interface SceneExportOptions {
  format: SceneExportFormat;
  /** Multiplier on the format size. */
  scale: number;
  /** For JPG and WebP, 0 to 1. */
  quality?: number;
  signal?: AbortSignal;
  /** Pictures already decoded by the editor. */
  images?: ReadonlyMap<string, Picture>;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode-failed"))),
      type,
      quality,
    );
  });
}

export async function exportScene(
  kit: KonvaKit,
  scene: Scene,
  options: SceneExportOptions,
): Promise<Blob> {
  const { width, height } = scene.format;
  const out = {
    width: Math.round(width * options.scale),
    height: Math.round(height * options.scale),
  };
  const background =
    scene.layers[0]?.kind === "background" && scene.layers[0].visible ? scene.layers[0] : null;
  const [bitmap, images] = await Promise.all([
    background ? renderBackground(background, scene.format, out, options.signal) : null,
    options.images ? Promise.resolve(options.images) : scenePictures(scene),
    loadSceneFonts(scene),
  ]);
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const pictures: ScenePictures = { background: bitmap, images };
  const container = document.createElement("div");
  const stage = new kit.Konva.Stage({ container, width, height });
  try {
    if (options.format === "jpg") {
      // JPG has no transparency: white under the scene, like the tool export.
      const base = new kit.Konva.Layer({ listening: false });
      base.add(new kit.Rect({ x: 0, y: 0, width, height, fill: "#ffffff" }));
      stage.add(base);
    }
    const layer = new kit.Konva.Layer({ listening: false });
    stage.add(layer);
    drawScene(kit, layer, scene, pictures, { interactive: false });
    const canvas = stage.toCanvas({ pixelRatio: options.scale, x: 0, y: 0, width, height });
    return await canvasToBlob(canvas, MIME[options.format], options.quality);
  } finally {
    bitmap?.close();
    stage.destroy();
  }
}

/** `musterli-social-1080x1350.png` */
export function exportFileName(scene: Scene, format: SceneExportFormat, scale: number): string {
  const w = Math.round(scene.format.width * scale);
  const h = Math.round(scene.format.height * scale);
  return `musterli-social-${w}x${h}.${format}`;
}

/** A thumbnail of about 400 px for "Meine Designs" (WebP, PNG where the browser cannot). */
export async function sceneThumbnail(
  kit: KonvaKit,
  scene: Scene,
  images?: ReadonlyMap<string, Picture>,
): Promise<Blob | null> {
  const scale = Math.min(1, 400 / Math.max(scene.format.width, scene.format.height));
  try {
    const blob = await exportScene(kit, scene, {
      format: "webp",
      scale,
      quality: 0.8,
      ...(images ? { images } : {}),
    });
    if (blob.type === "image/webp") return blob;
    return await exportScene(kit, scene, { format: "png", scale, ...(images ? { images } : {}) });
  } catch {
    return null;
  }
}
