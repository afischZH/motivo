/**
 * Text exports (SVG, CSS, extra exports). Pure: they run in Node, workers
 * and the browser alike and only call the tool's own render functions.
 *
 * Every exporter builds a fresh render context from `ctx.seed`, size and
 * `t`, so a context whose rng was already consumed (e.g. by the preview)
 * still yields exactly the preview's output (one render path).
 */
import {
  createRenderContext,
  type AnyToolDefinition,
  type CodeLanguage,
  type ExportFormat,
  type ExtraExport,
  type Params,
  type ParamsSchema,
  type RenderContext,
  type ToolDefinition,
} from "@motivo/tool-registry";
import { ExportError } from "./errors";
import { CODE_LANGUAGE_FILES, MIME_TYPES } from "./formats";

/** Same seed, size and time as `ctx`, with a new rng. */
export function freshContext(ctx: RenderContext): RenderContext {
  return createRenderContext(ctx.seed, { width: ctx.width, height: ctx.height }, ctx.t);
}

/** Whether the tool's render kind can produce the format at all. */
function kindSupports(tool: AnyToolDefinition, format: ExportFormat): boolean {
  switch (tool.render.kind) {
    case "svg":
      return (
        format === "svg" ||
        format === "css" ||
        format === "png" ||
        format === "jpg" ||
        format === "webp"
      );
    case "css":
      // SVG and raster need the optional preview SVG; checked at export time.
      return (
        format === "css" ||
        format === "svg" ||
        format === "png" ||
        format === "jpg" ||
        format === "webp"
      );
    default:
      return false;
  }
}

/**
 * Whether the exporters in this package can produce `format` for the tool:
 * the tool must declare it in `exports` and its render kind must support it.
 */
export function supportsExport(tool: AnyToolDefinition, format: ExportFormat): boolean {
  return tool.exports.includes(format) && kindSupports(tool, format);
}

function requireFormat(tool: AnyToolDefinition, format: ExportFormat): void {
  if (!supportsExport(tool, format)) {
    throw new ExportError(
      "unsupported-format",
      `Tool "${tool.id}" (${tool.render.kind}) cannot export ${format}`,
    );
  }
}

/**
 * The design as a standalone SVG document (already compact, see the
 * engine's fixed precision). CSS tools return their preview SVG.
 * Throws `ExportError("unsupported-format")`.
 */
export function exportSvg<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  params: Params<S>,
  ctx: RenderContext,
): string {
  const t: AnyToolDefinition = tool;
  requireFormat(t, "svg");
  return renderDesignSvg(tool, params, ctx);
}

/**
 * The design's SVG (SVG tools: the render output; CSS tools: the preview),
 * regardless of whether "svg" is an offered export. Used for rasterising.
 */
export function renderDesignSvg<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  params: Params<S>,
  ctx: RenderContext,
): string {
  const render = tool.render;
  if (render.kind === "svg") return render.render(params, freshContext(ctx));
  if (render.kind === "css") {
    const svg = render.render(params, freshContext(ctx)).previewSvg;
    if (svg !== undefined) return svg;
  }
  throw new ExportError("unsupported-format", `Tool "${tool.id}" has no SVG output`);
}

/**
 * Characters that must be percent-encoded in an SVG data URI inside a CSS
 * `url("...")`: controls, double quotes, `%` and `#` (fragment), `<>` and
 * the other URL-unsafe ASCII characters, and everything outside ASCII.
 * Single quotes are fine inside a double-quoted CSS string.
 */
// eslint-disable-next-line no-control-regex -- control characters are exactly what must be encoded
const DATA_URI_UNSAFE = /[\0-\x1f"%#<>[\\\]^`{|}\x7f-\u{10ffff}]/gu;

function percentEncode(ch: string): string {
  try {
    return encodeURIComponent(ch);
  } catch {
    // Lone surrogate: not valid UTF-16, replace with U+FFFD.
    return "%EF%BF%BD";
  }
}

/**
 * Compact `data:image/svg+xml,` URI (percent-encoded, not base64, which is
 * about a third larger). Double quotes become single quotes when the SVG has
 * none, which keeps attribute-heavy SVG readable and short.
 */
export function svgToDataUri(svg: string): string {
  const quoted = svg.includes("'") ? svg : svg.replace(/"/g, "'");
  return `data:image/svg+xml,${quoted.replace(DATA_URI_UNSAFE, percentEncode)}`;
}

/**
 * CSS declarations (no selector) that reproduce the design: native CSS for
 * CSS tools, the SVG as a background data URI for SVG tools.
 * Throws `ExportError("unsupported-format")`.
 */
export function exportCss<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  params: Params<S>,
  ctx: RenderContext,
): string {
  const t: AnyToolDefinition = tool;
  requireFormat(t, "css");
  const render = tool.render;
  if (render.kind === "css") return render.render(params, freshContext(ctx)).css;
  const svg = exportSvg(tool, params, ctx);
  return [
    `background-image: url("${svgToDataUri(svg)}");`,
    "background-size: cover;",
    "background-position: center;",
    "background-repeat: no-repeat;",
  ].join("\n");
}

/** Metadata of an extra export, for listing in the export dialog. */
export interface ExtraExportInfo {
  id: string;
  labelKey: string;
  language: CodeLanguage;
  mime: string;
  extension: string;
}

/** The tool's extra exports in declaration order. */
export function listExtraExports(tool: AnyToolDefinition): ExtraExportInfo[] {
  return (tool.extraExports ?? []).map((e) => ({
    id: e.id,
    labelKey: e.labelKey,
    language: e.language,
    ...CODE_LANGUAGE_FILES[e.language],
  }));
}

/** Renders one extra export. Throws `ExportError("unknown-extra")`. */
export function exportExtra<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  id: string,
  params: Params<S>,
  ctx: RenderContext,
): string {
  const extras: readonly ExtraExport<Params<S>>[] = tool.extraExports ?? [];
  const extra = extras.find((e) => e.id === id);
  if (!extra)
    throw new ExportError("unknown-extra", `Tool "${tool.id}" has no extra export "${id}"`);
  return extra.render(params, freshContext(ctx));
}

/** UTF-8 text as a Blob with the given MIME type (`;charset=utf-8` added for text types). */
export function textBlob(text: string, mime: string): Blob {
  const type = mime.startsWith("text/") ? `${mime};charset=utf-8` : mime;
  return new Blob([text], { type });
}

/** An SVG string as an `image/svg+xml` Blob. */
export function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: MIME_TYPES.svg });
}
