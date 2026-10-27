/**
 * Open Graph images: one PNG per tool and locale (1200 × 630), the tool's
 * default motif with its localized name. Rendered at build time by
 * `scripts/og-images.mjs` with `next/og` in Node and written to
 * `public/og/<locale>/<toolId>.png`, so they are plain static assets: no
 * rendering per request and no Satori/resvg (about 850 KiB gzip) in the
 * Worker bundle.
 *
 * No JSX and no path aliases: the build script imports this file directly.
 */
import { createElement, type ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Public path of a tool's OG image in a locale. */
export function ogImagePath(toolId: string, locale: string): string {
  return `/og/${locale}/${toolId}.png`;
}

/*
 * The image is a raster asset outside the themed UI, so it uses fixed
 * colours: a light canvas behind transparent motifs and a dark caption.
 */
const CANVAS = "#e9e9ec";
const CAPTION_BG = "#111113";
const CAPTION_FG = "#fafafa";
const CAPTION_MUTED = "#b4b4bb";

/** The image as a Satori element tree. `svg` is the motif as an SVG document. */
export function ogElement({
  svg,
  brand,
  title,
}: {
  svg: string;
  brand: string;
  title: string;
}): ReactElement {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: CANVAS,
      },
    },
    createElement("img", {
      src,
      alt: "",
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      style: { position: "absolute", inset: 0, objectFit: "cover" },
    }),
    createElement(
      "div",
      {
        style: {
          position: "absolute",
          left: 56,
          bottom: 56,
          maxWidth: 760,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "28px 36px",
          borderRadius: 20,
          backgroundColor: CAPTION_BG,
          color: CAPTION_FG,
        },
      },
      createElement("div", { style: { fontSize: 28, color: CAPTION_MUTED } }, brand),
      createElement("div", { style: { fontSize: 64, lineHeight: 1.1 } }, title),
    ),
  );
}
