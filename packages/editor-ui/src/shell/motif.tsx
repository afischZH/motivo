"use client";

import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { cx } from "../controls/primitives";
import { cssToStyle, svgDataUrl, type CssSupports, type MotifOutput } from "./render";

const noopSubscribe = () => () => undefined;

let cachedSupports: CssSupports | undefined | null = null;

/** Stable reference, as `useSyncExternalStore` requires. */
function browserSupports(): CssSupports | undefined {
  if (cachedSupports === null) {
    const css = (globalThis as { CSS?: { supports?: (p: string, v: string) => boolean } }).CSS;
    cachedSupports =
      typeof css?.supports === "function"
        ? (property, value) => css.supports?.(property, value) ?? false
        : undefined;
  }
  return cachedSupports;
}

/**
 * `CSS.supports`, but only after hydration: the server and the first client
 * render use the fallback values, so the markup matches.
 */
function useCssSupports(): CssSupports | undefined {
  return useSyncExternalStore(noopSubscribe, browserSupports, () => undefined);
}

export interface MotifProps {
  output: MotifOutput;
  /** Size the design was rendered at, in CSS pixels. */
  width: number;
  height: number;
  /** Display scale, 1 = 100 %. */
  scale: number;
  className?: string;
}

/**
 * Shows a rendered design at a given scale. Purely visual (`aria-hidden`):
 * the caller provides the accessible name. SVG goes through `<img>` (never
 * inline markup); CSS is applied as an inline style to a box of the render
 * size, scaled with a transform so px-based declarations stay exact.
 */
export function Motif({ output, width, height, scale, className }: MotifProps) {
  const supports = useCssSupports();
  const declarations = output.kind === "css" ? output.declarations : null;
  const cssStyle = useMemo(
    () => (declarations ? cssToStyle(declarations, supports) : null),
    [declarations, supports],
  );
  const svgSrc = useMemo(() => (output.kind === "svg" ? svgDataUrl(output.svg) : null), [output]);

  const box: CSSProperties = { width: width * scale, height: height * scale };

  if (svgSrc !== null) {
    return (
      <img
        src={svgSrc}
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        draggable={false}
        className={cx("block max-w-none select-none", className)}
        style={box}
      />
    );
  }

  if (cssStyle !== null) {
    return (
      <div aria-hidden="true" className={cx("relative overflow-hidden", className)} style={box}>
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ ...cssStyle, width, height, transform: `scale(${scale})` }}
        />
      </div>
    );
  }

  return <div aria-hidden="true" className={cx("bg-muted", className)} style={box} />;
}
