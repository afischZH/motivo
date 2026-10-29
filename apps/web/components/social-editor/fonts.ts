/**
 * Font loading of the social editor (M6-AP03), with the FontFace API and
 * only on the editor page (this module is imported by the editor alone):
 *
 *  - Library fonts register one `FontFace` per weight and subset under
 *    their internal family (`musterli-<id>`), pointing at the self-hosted
 *    WOFF2 files (`font-src 'self'`). Registering fetches nothing; a file is
 *    fetched when text needs it (`document.fonts.load` with the text, so
 *    latin-ext only when the text has such characters).
 *  - Brand fonts come from the brand kit (IndexedDB) as bytes and become a
 *    `FontFace` from an `ArrayBuffer` (no URL, no fetch), registered as
 *    `musterli-brand-<id>`. A text layer whose brand font is not in this
 *    browser keeps its fallback stack and is reported as missing.
 *
 * `loadSceneFonts` resolves once every font the scene's text layers use is
 * ready, so the stage, Magic Resize (text measuring) and the export never
 * draw with a fallback font by accident.
 */
import {
  brandFamilyName,
  libraryFamilyName,
  libraryFont,
  type FontRef,
  type Scene,
  type TextLayer,
} from "@musterli/scene";

import { FONT_SUBSETS, fontFiles } from "./font-files";

export interface BrandFontSource {
  id: string;
  name: string;
  data: ArrayBuffer;
}

/** Library fonts whose faces are registered (by id). */
const registeredLibrary = new Set<string>();
/** Brand fonts by id: their face once created, or the failure. */
const brandFaces = new Map<string, Promise<FontFace | null>>();
/** Brand fonts of this browser's brand kit (set by the editor). */
let brandSources = new Map<string, BrandFontSource>();

function fontSet(): FontFaceSet | null {
  return typeof document !== "undefined" && "fonts" in document ? document.fonts : null;
}

/** Sets the brand fonts the editor knows (the brand kit's list). */
export function setBrandFontSources(fonts: readonly BrandFontSource[]): void {
  brandSources = new Map(fonts.map((f) => [f.id, f]));
}

export function brandFontSource(id: string): BrandFontSource | undefined {
  return brandSources.get(id);
}

function registerLibraryFont(id: string): boolean {
  const font = libraryFont(id);
  const set = fontSet();
  if (!font || !set || typeof FontFace === "undefined") return false;
  if (registeredLibrary.has(id)) return true;
  for (const file of fontFiles(font)) {
    set.add(
      new FontFace(libraryFamilyName(id), `url(${file.url}) format("woff2")`, {
        weight: String(file.weight),
        style: "normal",
        unicodeRange: FONT_SUBSETS[file.subset],
        display: "block",
      }),
    );
  }
  registeredLibrary.add(id);
  return true;
}

function brandFace(id: string): Promise<FontFace | null> {
  let pending = brandFaces.get(id);
  if (pending) return pending;
  const source = brandSources.get(id);
  const set = fontSet();
  if (!source || !set || typeof FontFace === "undefined") return Promise.resolve(null);
  pending = (async () => {
    try {
      // A copy: the face may keep the buffer, the brand kit list keeps its own.
      const face = new FontFace(brandFamilyName(id), source.data.slice(0));
      await face.load();
      set.add(face);
      return face;
    } catch {
      return null;
    }
  })();
  brandFaces.set(id, pending);
  return pending;
}

/** The CSS `font` shorthand `document.fonts.load` needs (size does not matter). */
function shorthand(family: string, weight: number, style: "normal" | "italic"): string {
  return `${style === "italic" ? "italic " : ""}${weight} 16px ${family}`;
}

/** Text that decides which subsets load: the layer's text, or a sample. */
function sampleText(text: string): string {
  return text.trim() === "" ? "Aa" : text;
}

export interface FontLoadResult {
  /** Brand fonts used by the scene that this browser does not have (by id). */
  missing: Set<string>;
}

/** Loads one font for the given style and text. Never throws. */
export async function loadFont(
  ref: FontRef,
  weight: number,
  style: "normal" | "italic",
  text = "Aa",
): Promise<boolean> {
  const set = fontSet();
  if (!set) return false;
  if (ref.kind === "brand") return (await brandFace(ref.id)) !== null;
  if (!registerLibraryFont(ref.id)) return false;
  try {
    await set.load(shorthand(libraryFamilyName(ref.id), weight, style), sampleText(text));
    return true;
  } catch {
    return false;
  }
}

/** The fonts the text layers of a scene draw with, loaded. Never throws. */
export async function loadSceneFonts(scene: Scene): Promise<FontLoadResult> {
  const missing = new Set<string>();
  const texts = scene.layers.filter(
    (l): l is TextLayer & { font: FontRef } => l.kind === "text" && l.font !== undefined,
  );
  await Promise.all(
    texts.map(async (layer) => {
      const ok = await loadFont(layer.font, layer.fontWeight, layer.fontStyle, layer.text);
      if (!ok && layer.font.kind === "brand") missing.add(layer.font.id);
    }),
  );
  return { missing };
}

/**
 * A key that changes when the scene needs other font files: font, weight,
 * style, and whether a layer's text leaves the latin subset.
 */
export function sceneFontKey(scene: Scene): string {
  const keys = new Set<string>();
  for (const l of scene.layers) {
    if (l.kind !== "text" || !l.font) continue;
    // eslint-disable-next-line no-control-regex -- the latin subset ends at U+00FF
    const extended = /[^\u0000-ÿ]/.test(l.text) ? "x" : "";
    keys.add(`${l.font.kind}:${l.font.id}:${l.fontWeight}:${l.fontStyle}:${extended}`);
  }
  return [...keys].sort().join("|");
}
