/**
 * Open Graph images of the collections: one PNG per item and locale, built
 * by `scripts/og-images.mjs` into `public/og/<locale>/<kind>/<id>.png`. The
 * motif is the item itself, rendered by the tool it belongs to (CSS
 * Gradient for gradients, Palette Generator without labels for palettes).
 * Nothing here imports the app's routing: the build script loads this file.
 */
import { createRenderContext } from "@motivo/tool-registry";

import type { CollectionKind } from "@/i18n/slugs";
import { OG_SIZE } from "@/lib/seo/og";

import { curatedGradients, gradientKeys, type CuratedGradient } from "./gradients";
import { curatedPalettes, paletteKeys, type CuratedPalette } from "./palettes";
import { collectionTool, gradientDesign, paletteVariants } from "./variants";

/** OG image key below `/og/<locale>/` (see `ogImagePath`). */
export function collectionOgKey(kind: CollectionKind, id: string): string {
  return `${kind}/${id}`;
}

function svgAt(toolId: string, params: Readonly<Record<string, unknown>>, seed: number): string {
  const tool = collectionTool(toolId);
  const ctx = createRenderContext(seed, OG_SIZE);
  // Collection designs start from the tool's defaults (checked by the schema test).
  const typed = params as Parameters<typeof tool.randomize>[1];
  const svg =
    tool.render.kind === "svg"
      ? tool.render.render(typed, ctx)
      : tool.render.kind === "css"
        ? tool.render.render(typed, ctx).previewSvg
        : undefined;
  if (!svg) throw new Error(`og: ${toolId} cannot render on the server`);
  return svg;
}

export function gradientOgSvg(gradient: CuratedGradient): string {
  const design = gradientDesign(gradient);
  return svgAt("css-gradient", design.params, design.seed);
}

export function paletteOgSvg(palette: CuratedPalette): string {
  const variant = paletteVariants(palette).colour.find((v) => v.toolId === "palette-generator");
  if (!variant) throw new Error(`og: no palette design for ${palette.id}`);
  return svgAt(
    "palette-generator",
    { ...variant.design.params, labels: "none", contrast: false, matrix: false },
    variant.design.seed,
  );
}

/** Every collection OG image: its key, the message key of its title and the motif. */
export function collectionOgImages(): { key: string; nameKey: string; svg: () => string }[] {
  return [
    ...curatedGradients().map((g) => ({
      key: collectionOgKey("gradients", g.id),
      nameKey: gradientKeys(g.id).name,
      svg: () => gradientOgSvg(g),
    })),
    ...curatedPalettes().map((p) => ({
      key: collectionOgKey("palettes", p.id),
      nameKey: paletteKeys(p.id).name,
      svg: () => paletteOgSvg(p),
    })),
  ];
}
