/**
 * Geometry of the text effects that the renderer draws itself (M6-AP03):
 * the highlight bar behind each line and the line of the gradient fill.
 * Pure, so the stage, the export and the tests agree on every pixel; the
 * editor's Konva renderer feeds in the lines it laid out.
 */
import type { TextLayer } from "./schema";

export interface LaidOutLine {
  /** Width of the line's text in pixels (letter spacing included). */
  width: number;
}

export interface EffectRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Horizontal padding is `padding`, vertical padding half of it. */
export const HIGHLIGHT_VERTICAL_SHARE = 0.5;
/** Corner radius of a highlight bar, in font sizes (a marker, not a pill). */
export const HIGHLIGHT_RADIUS_EM = 0.08;

/**
 * Where the text block starts vertically in its box (same rule as the text
 * renderer: free space above, half of it, or none).
 */
export function textBlockTop(
  valign: TextLayer["valign"],
  boxHeight: number,
  lines: number,
  lineHeightPx: number,
): number {
  const free = boxHeight - lines * lineHeightPx;
  if (valign === "middle") return free / 2;
  if (valign === "bottom") return free;
  return 0;
}

/**
 * One bar per non-empty line, in the layer's box coordinates: the line's
 * text (aligned like the text) plus `padding` left and right, and the em
 * box (one font size, centred in the line) plus half the padding above and
 * below. Empty lines get no bar.
 */
export function highlightRects(
  lines: readonly LaidOutLine[],
  layer: Pick<TextLayer, "align" | "valign" | "fontSize" | "lineHeight" | "width" | "height">,
  padding: number,
): EffectRect[] {
  const lineHeightPx = layer.fontSize * layer.lineHeight;
  const top = textBlockTop(layer.valign, layer.height, lines.length, lineHeightPx);
  const padY = padding * HIGHLIGHT_VERTICAL_SHARE;
  const out: EffectRect[] = [];
  lines.forEach((line, i) => {
    if (!(line.width > 0)) return;
    const x =
      layer.align === "right"
        ? layer.width - line.width
        : layer.align === "center"
          ? (layer.width - line.width) / 2
          : 0;
    const y = top + i * lineHeightPx + (lineHeightPx - layer.fontSize) / 2;
    out.push({
      x: x - padding,
      y: y - padY,
      width: line.width + padding * 2,
      height: layer.fontSize + padY * 2,
    });
  });
  return out;
}

export interface GradientLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * The gradient line of a CSS `linear-gradient(<angle>deg, …)` over a box of
 * `width` x `height`: 0° runs bottom to top, 90° left to right; the line
 * passes through the centre and is long enough that the corners get the
 * end colours exactly.
 */
export function gradientLine(angle: number, width: number, height: number): GradientLine {
  const a = ((((angle % 360) + 360) % 360) * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  // "+ 0" turns -0 into 0.
  const round = (v: number) => Math.round(v * 1000) / 1000 + 0;
  return {
    start: { x: round(cx - dx * half), y: round(cy - dy * half) },
    end: { x: round(cx + dx * half), y: round(cy + dy * half) },
  };
}
