/**
 * Live web embeds for WebGL tools (docs/ARCHITECTURE.md 4.21): extra
 * exports that wrap the tool's own fragment shader and uniforms in the
 * standalone player of `@musterli/shaders`. One line per tool:
 * `extraExports: webEmbedExports("Shader gradient", render)`.
 */
import {
  buildEmbedConfig,
  embedGlsl,
  embedHtml,
  embedReact,
  embedWebComponent,
  paletteTextureData,
  type EmbedConfig,
  type EmbedSnippetOptions,
} from "@musterli/shaders";
import { createRenderContext } from "./render";
import { EXTRA_EXPORT_LABELS } from "./tools/shared";
import type { ExtraExport, RenderContext, WebglRenderer } from "./types";

/** Ids of the embed exports, in dialog order. */
export const WEB_EMBED_EXPORT_IDS = ["web-component", "react", "html-embed", "glsl"] as const;

/** Embed config of a design: loop length from `loopSeconds`, uniforms per loop time. */
export function webEmbedConfig<P>(
  renderer: WebglRenderer<P>,
  params: P,
  ctx: RenderContext,
): EmbedConfig {
  const size = { width: ctx.width, height: ctx.height };
  return buildEmbedConfig({
    fragment: renderer.fragment,
    uniformsAt: (t) => renderer.uniforms(params, createRenderContext(ctx.seed, size, t)),
    palette: renderer.palette ? paletteTextureData(renderer.palette(params)) : null,
    loopSeconds: renderer.loopSeconds?.(params) ?? 0,
  });
}

/** Example height: the design's aspect at a typical 1200 px wide section, 320 to 720 px. */
function exampleHeight(ctx: RenderContext): number {
  const h = Math.round((1200 * ctx.height) / Math.max(1, ctx.width) / 10) * 10;
  return Math.min(720, Math.max(320, h));
}

type Snippet = (config: EmbedConfig, opts: EmbedSnippetOptions) => string;

/** The four embed exports of a WebGL tool (Web Component, React, HTML, GLSL). */
export function webEmbedExports<P>(title: string, renderer: WebglRenderer<P>): ExtraExport<P>[] {
  const make = (
    id: (typeof WEB_EMBED_EXPORT_IDS)[number],
    labelKey: string,
    language: ExtraExport<P>["language"],
    snippet: Snippet,
  ): ExtraExport<P> => ({
    id,
    labelKey,
    descriptionKey: `${labelKey}Hint`,
    language,
    render: (params, ctx) =>
      snippet(webEmbedConfig(renderer, params, ctx), { title, height: exampleHeight(ctx) }),
  });
  return [
    make("web-component", EXTRA_EXPORT_LABELS.webComponent, "js", embedWebComponent),
    make("react", EXTRA_EXPORT_LABELS.reactComponent, "js", embedReact),
    make("html-embed", EXTRA_EXPORT_LABELS.htmlEmbed, "html", embedHtml),
    make("glsl", EXTRA_EXPORT_LABELS.glsl, "glsl", embedGlsl),
  ];
}
