"use client";

import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { cx } from "../controls/primitives";
import {
  cssToStyle,
  motifDataUrl,
  type CssSupports,
  type MotifBox,
  type MotifElement,
  type MotifOutput,
} from "./render";

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

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = globalThis.matchMedia?.(REDUCED_MOTION);
  if (!media) return () => undefined;
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Whether the viewer allows motion. False on the server and before
 * hydration, so animations only start in the browser and never for viewers
 * who asked for reduced motion (docs/DESIGN.md 5).
 */
function useMotionAllowed(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => globalThis.matchMedia?.(REDUCED_MOTION).matches === false,
    () => false,
  );
}

/** Short deterministic hash for a stylesheet key (FNV-1a). */
function stableHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const absolute = (b: MotifBox): CSSProperties => ({
  position: "absolute",
  left: b.x,
  top: b.y,
  width: b.width,
  height: b.height,
  boxSizing: "border-box",
});

/**
 * The element of a CSS output (glass card, gradient border) as a real
 * element on the stage, so `backdrop-filter` acts on the stage behind it.
 * Its content boxes are drawn on top as siblings at the same offsets as in
 * the SVG twin (children would shift by the element's border width).
 */
function MotifElementView({
  element,
  supports,
}: {
  element: MotifElement;
  supports: CssSupports | undefined;
}) {
  const motionAllowed = useMotionAllowed();
  const style = useMemo(
    () => ({
      ...cssToStyle(element.declarations, supports),
      ...(motionAllowed ? cssToStyle(element.motion, supports) : {}),
      ...absolute(element),
    }),
    [element, supports, motionAllowed],
  );
  return (
    <>
      <div style={style} data-motif-element="" />
      {element.content.map((b, i) => (
        <div
          key={i}
          style={{
            ...cssToStyle(b.declarations, supports),
            ...absolute({ ...b, x: element.x + b.x, y: element.y + b.y }),
          }}
        />
      ))}
    </>
  );
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
  const svgSrc = useMemo(() => (output.kind === "svg" ? motifDataUrl(output) : null), [output]);

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
    const rules = output.kind === "css" ? output.rules : undefined;
    return (
      <div aria-hidden="true" className={cx("relative overflow-hidden", className)} style={box}>
        {rules !== undefined && (
          // Hoisted into <head> and shared by every motif with the same rules (React 19).
          <style href={`motif-rules-${stableHash(rules)}`} precedence="default">
            {rules}
          </style>
        )}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ ...cssStyle, width, height, transform: `scale(${scale})` }}
        >
          {output.kind === "css" && output.element && (
            <MotifElementView element={output.element} supports={supports} />
          )}
        </div>
      </div>
    );
  }

  return <div aria-hidden="true" className={cx("bg-muted", className)} style={box} />;
}
