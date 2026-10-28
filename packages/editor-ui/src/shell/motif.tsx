"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { cx } from "../controls/primitives";
import { rasterEffectClient, type RasterEffectJob } from "../raster-effect/client";
import {
  canUseObjectUrls,
  largeDataUrls,
  loadObjectUrl,
  objectUrlOf,
  withObjectUrls,
} from "./large-data-urls";
import {
  cssToStyle,
  motifDataUrl,
  type CssDeclarations,
  type CssSupports,
  type MotifBox,
  type MotifElement,
  type MotifOutput,
} from "./render";

type SwapUrls = (declarations: CssDeclarations) => CssDeclarations;

/**
 * Shows large data URIs of a CSS output through `blob:` URLs (see
 * `large-data-urls.ts`): returns a function that swaps them in, and renders
 * again once each one is decoded.
 */
function useLargeDataUrls(output: MotifOutput): SwapUrls {
  const large = useMemo(() => {
    if (output.kind !== "css" || !canUseObjectUrls()) return [];
    const el = output.element;
    const lists = [output.declarations];
    if (el) {
      lists.push(el.declarations, el.motion);
      for (const b of el.content) lists.push(b.declarations, ...(b.motion ? [b.motion] : []));
    }
    return [...new Set(lists.flatMap(largeDataUrls))];
  }, [output]);
  const [, setDecoded] = useState(0);
  useEffect(() => {
    let live = true;
    for (const url of large) {
      if (objectUrlOf(url) !== undefined) continue;
      void loadObjectUrl(url).then(() => {
        if (live) setDecoded((n) => n + 1);
      });
    }
    return () => {
      live = false;
    };
  }, [large]);
  const missing = large.filter((url) => objectUrlOf(url) === undefined).length;
  // `missing` changes once a picture is decoded, so the styles are rebuilt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((d: CssDeclarations) => withObjectUrls(d, large), [large, missing]);
}

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
  swapUrls,
}: {
  element: MotifElement;
  supports: CssSupports | undefined;
  swapUrls: SwapUrls;
}) {
  const motionAllowed = useMotionAllowed();
  const style = useMemo(
    () => ({
      ...cssToStyle(swapUrls(element.declarations), supports),
      ...(motionAllowed ? cssToStyle(swapUrls(element.motion), supports) : {}),
      ...absolute(element),
    }),
    [element, supports, motionAllowed, swapUrls],
  );
  return (
    <>
      <div style={style} data-motif-element="" />
      {element.content.map((b, i) => (
        <div
          key={i}
          style={{
            ...cssToStyle(swapUrls(b.declarations), supports),
            ...(motionAllowed && b.motion ? cssToStyle(swapUrls(b.motion), supports) : {}),
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
export function Motif(props: MotifProps) {
  return props.output.kind === "raster" ? (
    <RasterMotif {...props} output={props.output} />
  ) : (
    <VectorMotif {...props} />
  );
}

type RasterOutput = Extract<MotifOutput, { kind: "raster" }>;

/** Pixels of a raster motif at a display scale: device pixels, never above the design size. */
export function rasterPreviewSize(
  design: { width: number; height: number },
  scale: number,
  devicePixelRatio: number,
): { width: number; height: number } {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const k = Math.min(1, Math.max(0, scale) * ratio);
  return {
    width: Math.max(1, Math.round(design.width * k)),
    height: Math.max(1, Math.round(design.height * k)),
  };
}

/**
 * An image effect (docs/ARCHITECTURE.md 4.14): rendered by the raster-effect
 * worker at the displayed resolution and drawn into a canvas. One request in
 * flight per motif; changes meanwhile collapse into the latest one, and the
 * last picture stays visible until the next arrives. `data-rendered` and
 * `data-design` hold the pixel and design size of the picture shown
 * (end-to-end tests wait for them).
 */
function RasterMotif({
  output,
  width,
  height,
  scale,
  className,
}: MotifProps & { output: RasterOutput }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);
  const pump = useRef<{ busy: boolean; next: RasterEffectJob | null }>({ busy: false, next: null });
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const out = rasterPreviewSize(output.size, scale, dpr);

  useEffect(() => {
    const state = pump.current;
    state.next = {
      tool: output.tool,
      params: output.params,
      seed: output.seed,
      design: output.size,
      out: { width: out.width, height: out.height },
    };
    const step = () => {
      const job = state.next;
      if (state.busy || !job) return;
      state.next = null;
      state.busy = true;
      void rasterEffectClient()
        .preview(job)
        .then((bitmap) => {
          const canvas = ref.current;
          if (canvas) {
            // Resized only now: changing the size clears the canvas.
            if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
            if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
            canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
            canvas.dataset.rendered = `${bitmap.width}x${bitmap.height}`;
            canvas.dataset.design = `${job.design.width}x${job.design.height}`;
            setShown(true);
          }
          bitmap.close();
        })
        .catch(() => undefined)
        .finally(() => {
          state.busy = false;
          step();
        });
    };
    step();
  }, [output, out.width, out.height]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      width={1}
      height={1}
      className={cx("block max-w-none select-none", !shown && "bg-muted", className)}
      style={{ width: width * scale, height: height * scale }}
      data-raster-motif=""
    />
  );
}

function VectorMotif({ output, width, height, scale, className }: MotifProps) {
  const supports = useCssSupports();
  const swapUrls = useLargeDataUrls(output);
  const declarations = output.kind === "css" ? output.declarations : null;
  const cssStyle = useMemo(
    () => (declarations ? cssToStyle(swapUrls(declarations), supports) : null),
    [declarations, supports, swapUrls],
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
            <MotifElementView element={output.element} supports={supports} swapUrls={swapUrls} />
          )}
        </div>
      </div>
    );
  }

  return <div aria-hidden="true" className={cx("bg-muted", className)} style={box} />;
}
