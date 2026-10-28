import { SWATCH_FORMATS, colorInfo } from "@/lib/collections/colors";

import { CopyButton } from "./copy-button";

export interface SwatchListText {
  colorLabel: (index: number) => string;
  format: (format: (typeof SWATCH_FORMATS)[number]) => string;
  /** Screen reader text around a value's visible text: "Copy" before (EN), "kopieren" after (DE). */
  copyBefore: string;
  copyAfter: string;
  contrast: (text: string, ratio: string) => string;
  black: string;
  white: string;
  copied: string;
  failed: string;
}

/**
 * The colours of a collection item: a swatch with its hex value in the
 * better reading text colour, the contrast of that text, and every format
 * as a copy button. Server component; only the buttons hydrate.
 */
export function SwatchList({ colors, text }: { colors: readonly string[]; text: SwatchListText }) {
  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-4">
      {colors.map((hex, i) => {
        const info = colorInfo(hex);
        const textName = info.text === "#000000" ? text.black : text.white;
        return (
          <li
            key={`${hex}-${i}`}
            className="flex flex-col overflow-hidden rounded-card border border-border bg-card"
          >
            <div
              className="flex h-24 items-end p-3 font-mono text-sm font-medium"
              style={{ backgroundColor: info.hex, color: info.text }}
            >
              <span aria-hidden="true">{info.hex}</span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              <h3 className="sr-only">{text.colorLabel(i + 1)}</h3>
              <p className="text-xs text-muted-foreground">{text.contrast(textName, info.ratio)}</p>
              {SWATCH_FORMATS.map((format) => (
                <CopyButton
                  key={format}
                  format={text.format(format)}
                  value={info.values[format]}
                  before={text.copyBefore}
                  after={text.copyAfter}
                  copied={text.copied}
                  failed={text.failed}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
