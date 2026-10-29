/**
 * Brand-Apply (M6-AP05): the brand kit's palette, fonts and logo on a scene
 * in one step, through the scene's colour slots and the font roles of its
 * text layers. Pure; the editor loads the brand kit and the fonts, calls
 * `applyBrandKit` and records the result as one undo step.
 *
 *  - Colours: the slots `brand-1` ... keep their place, only the palette
 *    changes (`mapBrandColors`): every slot gets the brand colour closest
 *    in lightness and chroma, each brand colour used once before any is
 *    used twice, and a dark (light) slot never turns light (dark), so text
 *    keeps its contrast. A text on a panel (a filled shape under it, or its
 *    own highlight bar) whose contrast drops below 3:1 (4.5:1 if it had
 *    that) switches to the slot with the best contrast.
 *  - Fonts: `heading` texts get the first brand font, `body` texts the
 *    second (or the first when there is only one); no brand font, no
 *    change. Boxes grow to the new font's text (`settleTextLayer`).
 *  - Logo: logo layers (templates carry a hidden logo slot) show the brand
 *    logo, fitted into their box at its aspect ratio and anchored like the
 *    layer.
 *  - Locked layers keep their look: their slot colours are frozen to the
 *    colours they had, their fonts and logos stay.
 */
import { contrastRatio, hexToOklch } from "@musterli/engine";
import { createLogoLayer } from "./factory";
import { fontFamilyFor, type FontRef } from "./fonts";
import { boundsOf, frameOf } from "./geometry";
import { settleTextLayer } from "./resize";
import {
  isColorSlot,
  normalizeHex,
  resolveColor,
  type ColorRef,
  type FontRole,
  type Layer,
  type LogoLayer,
  type Scene,
  type SceneImage,
  type ShapeLayer,
  type TextLayer,
} from "./schema";
import type { TextMeasure } from "./text";

type Tone = "dark" | "mid" | "light";

/** OKLab lightness bounds of the dark and light tones. */
const DARK_BELOW = 0.5;
const LIGHT_ABOVE = 0.8;

function toneOf(l: number): Tone {
  return l < DARK_BELOW ? "dark" : l > LIGHT_ABOVE ? "light" : "mid";
}

interface Lch {
  l: number;
  c: number;
  h: number;
}

function lchOf(hex: string): Lch {
  const { l, c, h } = hexToOklch(hex);
  return { l, c, h };
}

/** How different two colours look as roles: lightness first, then chroma, then hue. */
function roleCost(a: Lch, b: Lch): number {
  let hue = 0;
  if (a.c > 0.04 && b.c > 0.04 && !Number.isNaN(a.h) && !Number.isNaN(b.h)) {
    const d = Math.abs(a.h - b.h) % 360;
    hue = (d > 180 ? 360 - d : d) / 180;
  }
  return 2 * Math.abs(a.l - b.l) + 1.5 * Math.abs(a.c - b.c) + 0.15 * hue;
}

/** Valid, lower-case, unique brand colours in their order. */
function cleanColors(colors: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of colors) {
    const hex = normalizeHex(c);
    if (hex && !out.includes(hex)) out.push(hex);
  }
  return out;
}

/**
 * The scene palette with brand colours: one brand colour per slot, by the
 * closest role (see the module comment). The result has the length of
 * `palette`; slots keep their colour when the brand has nothing of their
 * tone. Deterministic.
 */
export function mapBrandColors(palette: readonly string[], brand: readonly string[]): string[] {
  const colors = cleanColors(brand);
  const old = palette.map((c) => normalizeHex(c) ?? "#000000");
  if (colors.length === 0) return old;
  const brandLch = colors.map(lchOf);
  const oldLch = old.map(lchOf);
  const out: string[] = [...old];
  const unassigned = new Set(old.map((_, i) => i));
  let used = new Set<number>();
  while (unassigned.size > 0) {
    if (used.size === colors.length) used = new Set();
    let best: { i: number; j: number; cost: number } | null = null;
    for (const i of unassigned) {
      for (let j = 0; j < colors.length; j++) {
        if (used.has(j)) continue;
        const cost = roleCost(oldLch[i] as Lch, brandLch[j] as Lch);
        if (!best || cost < best.cost - 1e-12) best = { i, j, cost };
      }
    }
    if (!best) break;
    out[best.i] = colors[best.j] as string;
    unassigned.delete(best.i);
    used.add(best.j);
  }
  // Dark slots stay dark and light slots stay light.
  for (let i = 0; i < out.length; i++) {
    const tone = toneOf((oldLch[i] as Lch).l);
    if (tone === "mid" || toneOf(lchOf(out[i] as string).l) === tone) continue;
    let pick: { j: number; cost: number } | null = null;
    for (let j = 0; j < colors.length; j++) {
      if (toneOf((brandLch[j] as Lch).l) !== tone) continue;
      const cost = roleCost(oldLch[i] as Lch, brandLch[j] as Lch);
      if (!pick || cost < pick.cost - 1e-12) pick = { j, cost };
    }
    out[i] = pick ? (colors[pick.j] as string) : (old[i] as string);
  }
  return out;
}

/** The font role of a text layer: its own, else `heading` for the largest texts. */
export function fontRoleOf(layer: TextLayer, scene: Pick<Scene, "layers">): FontRole {
  if (layer.fontRole) return layer.fontRole;
  let largest = 0;
  for (const l of scene.layers) if (l.kind === "text") largest = Math.max(largest, l.fontSize);
  return layer.fontSize >= largest * 0.75 ? "heading" : "body";
}

const freeze = (ref: ColorRef, palette: readonly string[]): ColorRef =>
  isColorSlot(ref) ? resolveColor(ref, palette) : ref;

/** A layer whose slot colours are replaced by the colours they show now. */
function freezeLayer(layer: Layer, palette: readonly string[]): Layer {
  if (layer.kind === "text") {
    const e = layer.effects;
    return {
      ...layer,
      color: freeze(layer.color, palette),
      effects: {
        ...e,
        ...(e.shadow ? { shadow: { ...e.shadow, color: freeze(e.shadow.color, palette) } } : {}),
        ...(e.stroke ? { stroke: { ...e.stroke, color: freeze(e.stroke.color, palette) } } : {}),
        ...(e.highlight
          ? { highlight: { ...e.highlight, color: freeze(e.highlight.color, palette) } }
          : {}),
        ...(e.gradient
          ? {
              gradient: {
                ...e.gradient,
                from: freeze(e.gradient.from, palette),
                to: freeze(e.gradient.to, palette),
              },
            }
          : {}),
      },
    };
  }
  if (layer.kind === "shape") {
    return {
      ...layer,
      fill: layer.fill === null ? null : freeze(layer.fill, palette),
      stroke: layer.stroke === null ? null : freeze(layer.stroke, palette),
    };
  }
  return layer;
}

function usesSlot(layer: Layer): boolean {
  if (layer.kind === "text") {
    const e = layer.effects;
    return [
      layer.color,
      e.shadow?.color,
      e.stroke?.color,
      e.highlight?.color,
      e.gradient?.from,
      e.gradient?.to,
    ].some((c) => c !== undefined && isColorSlot(c));
  }
  if (layer.kind === "shape") {
    return [layer.fill, layer.stroke].some((c) => c !== null && isColorSlot(c));
  }
  return false;
}

/** The filled shape right under the centre of a text layer, if any (its panel). */
function panelUnder(scene: Scene, index: number): ShapeLayer | null {
  const text = scene.layers[index];
  if (!text) return null;
  const b = boundsOf(frameOf(text));
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  for (let i = index - 1; i >= 0; i--) {
    const l = scene.layers[i];
    if (!l || !l.visible || l.kind !== "shape" || l.fill === null || l.shape === "line") continue;
    if (l.opacity < 0.6) continue;
    const p = boundsOf(frameOf(l));
    if (cx >= p.x && cx <= p.x + p.width && cy >= p.y && cy <= p.y + p.height) return l;
  }
  return null;
}

/** What a text is read against: its highlight bar, else its panel; `null` for the background. */
function backdropOf(scene: Scene, index: number): ColorRef | null {
  const text = scene.layers[index];
  if (text?.kind !== "text") return null;
  if (text.effects.highlight) return text.effects.highlight.color;
  return panelUnder(scene, index)?.fill ?? null;
}

/**
 * Texts on a panel whose contrast fell below 3:1 (or below 4.5:1 when they
 * had that before) take the palette slot with the best contrast.
 */
function keepContrast(before: Scene, after: Scene): Scene {
  const slots = after.palette.map((_, i) => `brand-${i + 1}`);
  let layers: Layer[] | null = null;
  after.layers.forEach((layer, index) => {
    if (layer.kind !== "text" || layer.locked || !layer.visible) return;
    if (!isColorSlot(layer.color) || layer.effects.gradient) return;
    const backdrop = backdropOf(after, index);
    if (backdrop === null) return;
    const beforeLayer = before.layers[index];
    const beforeBackdrop = backdropOf(before, index);
    const was =
      beforeLayer?.kind === "text" && beforeBackdrop !== null
        ? contrastRatio(
            resolveColor(beforeLayer.color, before.palette),
            resolveColor(beforeBackdrop, before.palette),
          )
        : 4.5;
    const target = Math.min(4.5, Math.max(3, was));
    const bg = resolveColor(backdrop, after.palette);
    const now = contrastRatio(resolveColor(layer.color, after.palette), bg);
    if (now >= target) return;
    let best = { slot: layer.color, ratio: now };
    for (const slot of slots) {
      const ratio = contrastRatio(resolveColor(slot, after.palette), bg);
      if (ratio > best.ratio + 1e-9) best = { slot, ratio };
    }
    if (best.slot === layer.color) return;
    layers ??= [...after.layers];
    layers[index] = { ...layer, color: best.slot };
  });
  return layers ? { ...after, layers } : after;
}

/** A box of the picture's aspect ratio inside `box`, placed by the layer's anchors. */
function fitLogoBox(layer: LogoLayer, image: SceneImage) {
  const k = Math.min(layer.width / image.width, layer.height / image.height);
  const width = image.width * k;
  const height = image.height * k;
  const place = (start: number, size: number, inner: number, anchor: string) =>
    anchor === "start"
      ? start
      : anchor === "end"
        ? start + size - inner
        : start + (size - inner) / 2;
  return {
    x: place(layer.x, layer.width, width, layer.constraints.h),
    y: place(layer.y, layer.height, height, layer.constraints.v),
    width,
    height,
  };
}

export interface BrandLogo {
  image: SceneImage;
  /** Brand kit asset id. */
  assetId: string | null;
  name: string;
}

export interface BrandKitInput {
  /** The brand palette (2 to 10 colours); `null` keeps the colours. */
  colors?: readonly string[] | null;
  /** Brand fonts in brand kit order: the first for headings, the second for body text. */
  fonts?: readonly FontRef[];
  logo?: BrandLogo | null;
}

export interface BrandApplyOptions {
  /** Text measuring: boxes grow to the new fonts. Without it boxes stay. */
  measure?: TextMeasure;
  /** Adds a logo layer with this id when the scene has none (bottom right). */
  newLogoId?: string;
}

export interface BrandApplyResult {
  scene: Scene;
  /** The palette changed. */
  colors: boolean;
  /** Text layers with a new font. */
  fonts: number;
  /** Logo layers with the brand logo. */
  logos: number;
}

/** The brand kit on a scene (see the module comment). Returns the same scene when nothing applies. */
export function applyBrandKit(
  scene: Scene,
  brand: BrandKitInput,
  options: BrandApplyOptions = {},
): BrandApplyResult {
  let next = scene;
  let colors = false;
  let fonts = 0;
  let logos = 0;

  const brandColors = cleanColors(brand.colors ?? []);
  if (brandColors.length >= 2) {
    const palette = mapBrandColors(scene.palette, brandColors);
    if (palette.some((c, i) => c !== scene.palette[i])) {
      const layers = scene.layers.map((l) =>
        l.locked && usesSlot(l) ? freezeLayer(l, scene.palette) : l,
      );
      next = keepContrast(scene, { ...scene, palette, layers });
      colors = true;
    }
  }

  const brandFonts = brand.fonts ?? [];
  const heading = brandFonts[0];
  const body = brandFonts[1] ?? heading;
  if (heading && body) {
    const layers = next.layers.map((l) => {
      if (l.kind !== "text" || l.locked) return l;
      const font = fontRoleOf(l, next) === "heading" ? heading : body;
      if (l.font?.kind === font.kind && l.font.id === font.id) return l;
      fonts++;
      const changed: TextLayer = { ...l, font, fontFamily: fontFamilyFor(font) };
      return options.measure ? settleTextLayer(changed, options.measure, next.format) : changed;
    });
    if (fonts > 0) next = { ...next, layers };
  }

  const logo = brand.logo;
  if (logo) {
    const hasLogo = next.layers.some((l) => l.kind === "logo");
    if (hasLogo) {
      const layers = next.layers.map((l) => {
        if (l.kind !== "logo" || l.locked) return l;
        logos++;
        return {
          ...l,
          ...fitLogoBox(l, logo.image),
          image: logo.image,
          assetId: logo.assetId,
          name: logo.name,
          visible: true,
        } satisfies LogoLayer;
      });
      if (logos > 0) next = { ...next, layers };
    } else if (options.newLogoId) {
      const layer = createLogoLayer(
        options.newLogoId,
        next.format,
        logo.image,
        logo.assetId,
        logo.name,
      );
      next = { ...next, layers: [...next.layers, layer] };
      logos = 1;
    }
  }

  return { scene: next, colors, fonts, logos };
}

/**
 * Colours for the background tool after Brand-Apply: the palette without
 * the colours texts are drawn in (so the motif does not swallow the text),
 * or the whole palette when that leaves fewer than two.
 */
export function backgroundBrandColors(scene: Scene): string[] {
  const textColors = new Set<string>();
  for (const l of scene.layers) {
    if (l.kind === "text" && l.visible) textColors.add(resolveColor(l.color, scene.palette));
  }
  const all = cleanColors(scene.palette);
  const rest = all.filter((c) => !textColors.has(c));
  const out = rest.length >= 2 ? rest : all;
  return out.length >= 2 ? out : [...out, ...out, "#ffffff"].slice(0, 2);
}
