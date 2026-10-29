/**
 * Text measuring for Magic Resize with the very text engine that draws:
 * one off-screen `Konva.Text` with the layer's style lays the text out
 * (word wrap, line height, letter spacing), so the fit computed by
 * `@musterli/scene` matches the stage and the export to the pixel.
 */
import type { TextMeasure } from "@musterli/scene";

import type { KonvaKit } from "./konva";
import { konvaFontStyle } from "./konva-scene";

export function createKonvaMeasure(kit: KonvaKit): TextMeasure {
  const node = new kit.Text({ wrap: "word", padding: 0 });
  return {
    layout(text, style, maxWidth) {
      node.setAttrs({
        text,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontStyle: konvaFontStyle(style),
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing * style.fontSize,
        width: Math.max(1, maxWidth),
      });
      node.height("auto" as unknown as number); // Konva: "auto" height follows the text.
      const lines = Math.max(1, node.textArr.length);
      let widest = 0;
      for (const line of node.textArr) widest = Math.max(widest, line.width);
      const spacing = style.letterSpacing * style.fontSize;
      let overflow = false;
      for (const word of text.split(/\s+/)) {
        if (word === "") continue;
        if (node.measureSize(word).width + spacing * word.length > maxWidth + 0.5) {
          overflow = true;
          break;
        }
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
