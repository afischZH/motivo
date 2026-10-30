/**
 * Gradient text (docs/TOOLS.md M8): a headline filled with a linear
 * gradient, as SVG for images and as CSS (`background-clip: text`) for the
 * web. Both use the same angle and stops; the SVG gradient spans the text's
 * bounding box like the CSS background spans the element.
 *
 * Optional shine: the gradient is twice as wide and slides across the text.
 * In CSS that is a `background-position` animation, in the SVG the frame at
 * time `t` shifts the gradient by the same amount.
 */
import { formatNumber } from "../../curves";
import { bboxGradientVector, escapeXml, stableId, svgBackground, svgDocument } from "../../svg";
import { AVATAR_FONT_STACKS, type AvatarFont, estimateTextWidth } from "../avatar";

export const GRADIENT_TEXT_MAX = 60;

export interface GradientTextOptions {
  readonly width: number;
  readonly height: number;
  readonly text: string;
  readonly font: AvatarFont;
  readonly fontWeight: number;
  readonly italic: boolean;
  /** Letter spacing in em (may be negative). */
  readonly letterSpacing: number;
  /** Largest font size in px; smaller when the text would not fit. */
  readonly size: number;
  readonly colors: readonly string[];
  /** CSS-style gradient angle in degrees (90 = to the right). */
  readonly angle: number;
  readonly background: string;
  /** Repeats the gradient for a sliding shine. */
  readonly shine: boolean;
  /** Animation time in [0, 1) for the shine (0 = the still image). */
  readonly t?: number;
}

const f = (v: number): string => formatNumber(v, 2);

/** Stops of the gradient; with shine the colours run there and back, so the slide loops. */
export function gradientTextStops(colors: readonly string[], shine: boolean): string[] {
  const list = colors.length > 0 ? [...colors] : ["#000000"];
  return shine ? [...list, ...list.slice(0, -1).reverse()] : list;
}

/** Font size that fits the text into the canvas with a margin. */
export function gradientTextSize(o: GradientTextOptions): number {
  const em =
    estimateTextWidth(o.text, o.font) +
    Math.max(0, Array.from(o.text).length - 1) * o.letterSpacing;
  const byWidth = em > 0 ? (o.width * 0.86) / em : o.size;
  return Math.max(4, Math.min(o.size, byWidth, o.height * 0.7));
}

/** SVG document: background and one centred line of text with a gradient fill. */
export function gradientTextSvg(o: GradientTextOptions): string {
  const stops = gradientTextStops(o.colors, o.shine);
  const last = Math.max(1, stops.length - 1);
  const stopMarkup = stops
    .map((c, i) => `<stop offset="${formatNumber(i / last, 3)}" stop-color="${c}"/>`)
    .join("");
  // With shine the gradient is twice the box (background-size: 200%) and moves by one box per loop.
  const t = o.shine ? (((o.t ?? 0) % 1) + 1) % 1 : 0;
  const transform = o.shine
    ? ` gradientTransform="translate(${formatNumber(-t, 4)} 0) scale(2 1)" spreadMethod="repeat"`
    : "";
  const gradient = `<linearGradient ${bboxGradientVector(o.angle)}${transform}>${stopMarkup}</linearGradient>`;
  const id = stableId("t", gradient);
  const size = gradientTextSize(o);
  const text = escapeXml(o.text);
  const spacing = o.letterSpacing !== 0 ? ` letter-spacing="${f(o.letterSpacing * size)}"` : "";
  const style = o.italic ? ` font-style="italic"` : "";
  const body =
    svgBackground(o.background, o.width, o.height) +
    `<defs>${gradient.replace("<linearGradient ", `<linearGradient id="${id}" `)}</defs>` +
    (text === ""
      ? ""
      : `<text x="${f(o.width / 2)}" y="${f(o.height / 2 + size * 0.35)}" text-anchor="middle" ` +
        `font-family="${AVATAR_FONT_STACKS[o.font]}" font-size="${f(size)}" ` +
        `font-weight="${Math.round(o.fontWeight)}"${style}${spacing} fill="url(#${id})">${text}</text>`);
  return svgDocument(o.width, o.height, body);
}

/** CSS `linear-gradient()` of the text, the same stops as the SVG. */
export function gradientTextBackground(
  colors: readonly string[],
  angle: number,
  shine: boolean,
): string {
  return `linear-gradient(${formatNumber(angle, 1)}deg, ${gradientTextStops(colors, shine).join(", ")})`;
}
