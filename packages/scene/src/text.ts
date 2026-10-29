/**
 * Text measuring and fitting. The scene model never measures text itself:
 * a `TextMeasure` is injected. In the browser it is backed by the very text
 * engine that draws (Konva, canvas `measureText`), in tests by a
 * deterministic stub (`createWidthMeasure` with a fixed advance per
 * character), so Magic Resize is testable in Node.
 */
import { FONT_SIZE_MIN, type TextLayer } from "./schema";

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  /** Multiple of the font size. */
  lineHeight: number;
  /** In em. */
  letterSpacing: number;
}

export interface TextLayout {
  /** Widest line in pixels. */
  width: number;
  /** All lines in pixels (`lines * fontSize * lineHeight`). */
  height: number;
  lines: number;
  /** A single word is wider than the box: the renderer would break or cut it. */
  overflow: boolean;
}

export interface TextMeasure {
  /** Lays out `text` wrapped at word boundaries into lines of at most `maxWidth`. */
  layout(text: string, style: TextStyle, maxWidth: number): TextLayout;
}

export function textStyleOf(layer: TextLayer): TextStyle {
  return {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    fontStyle: layer.fontStyle,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
  };
}

/**
 * Greedy word wrap on top of a width function (width of a string in a
 * style, without letter spacing). Lines break at spaces and at `\n`, the
 * same break points the renderer uses.
 */
export function createWidthMeasure(
  widthOf: (text: string, style: TextStyle) => number,
): TextMeasure {
  return {
    layout(text, style, maxWidth) {
      const spacing = style.letterSpacing * style.fontSize;
      const measure = (s: string) => widthOf(s, style) + spacing * s.length;
      let lines = 0;
      let widest = 0;
      let overflow = false;
      for (const paragraph of text.split("\n")) {
        const words = paragraph.split(" ").filter((w) => w.length > 0);
        if (words.length === 0) {
          lines++;
          continue;
        }
        let line = "";
        for (const word of words) {
          const wordWidth = measure(word);
          if (wordWidth > maxWidth + 0.01) overflow = true;
          const candidate = line === "" ? word : `${line} ${word}`;
          if (line !== "" && measure(candidate) > maxWidth + 0.01) {
            widest = Math.max(widest, measure(line));
            lines++;
            line = word;
          } else {
            line = candidate;
          }
        }
        widest = Math.max(widest, measure(line));
        lines++;
      }
      return {
        width: widest,
        height: lines * style.fontSize * style.lineHeight,
        lines,
        overflow,
      };
    },
  };
}

/**
 * Deterministic stand-in for tests: every character advances `advance`
 * times the font size (bold a little wider), like a monospace font.
 */
export function createStubMeasure(advance = 0.56): TextMeasure {
  return createWidthMeasure(
    (text, style) => text.length * style.fontSize * advance * (style.fontWeight >= 600 ? 1.06 : 1),
  );
}

export interface TextFit {
  fontSize: number;
  /** Height the text needs at `fontSize`. */
  height: number;
  /** The text fits the given box height without overflowing words. */
  fits: boolean;
}

/** Factor per shrinking step: fine enough to land close to the largest fitting size. */
const SHRINK_STEP = 0.95;
const MAX_STEPS = 120;

/**
 * Largest font size from `style.fontSize` downwards at which `text` fits a
 * box of `width` x `height`. Shrinks down to `minFontSize`; below that the
 * text keeps its size and needs more height (the caller grows the box),
 * except for a single word wider than the box, which shrinks further
 * (down to `FONT_SIZE_MIN`) because the renderer would otherwise break it
 * mid-word. `maxHeight` (the canvas) is a hard limit: the text shrinks
 * below `minFontSize` rather than leave the canvas.
 */
export function fitText(
  text: string,
  style: TextStyle,
  width: number,
  height: number,
  minFontSize: number,
  measure: TextMeasure,
  maxHeight = Infinity,
): TextFit {
  const min = Math.max(FONT_SIZE_MIN, Math.min(minFontSize, style.fontSize));
  let size = style.fontSize;
  let layout = measure.layout(text, { ...style, fontSize: size }, width);
  for (let step = 0; step < MAX_STEPS; step++) {
    if (!layout.overflow && layout.height <= height + 0.5) {
      return { fontSize: size, height: layout.height, fits: true };
    }
    const hardLimit = layout.overflow || layout.height > maxHeight + 0.5;
    const floor = hardLimit ? FONT_SIZE_MIN : min;
    if (size <= floor) break;
    size = Math.max(floor, size * SHRINK_STEP);
    layout = measure.layout(text, { ...style, fontSize: size }, width);
  }
  return {
    fontSize: size,
    height: layout.height,
    fits: !layout.overflow && layout.height <= height + 0.5,
  };
}
