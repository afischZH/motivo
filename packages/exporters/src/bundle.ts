/**
 * Bundle exports (M4c-AP02): several files of one design in one ZIP, e.g.
 * the icon pack of the favicon generator. The tool lists the files
 * (`ToolDefinition.bundles`); image files are rendered here with the tool's
 * own render function at their size (one render path), rasterised like
 * every PNG export (decoded on the main thread, encoded in the raster
 * worker), `.ico` files assembled from those PNGs, and the archive is built
 * in the raster worker (`zip` message). Without a worker the ZIP is built on
 * the main thread; its deflate is asynchronous (`CompressionStream`).
 */
import {
  createRenderContext,
  type AnyToolDefinition,
  type BundleExport,
  type BundleFile,
  type CodeLanguage,
  type Params,
  type ParamsSchema,
  type RenderContext,
  type ToolDefinition,
} from "@musterli/tool-registry";
import { ExportError, throwIfAborted } from "./errors";
import { CODE_LANGUAGE_FILES, exportFilename } from "./formats";
import { encodeIco } from "./ico";
import { defaultRasterEnv, rasterizeSvg, type RasterEnv, type WorkerLike } from "./raster";
import { type EncodeResponse, type ZipMessage } from "./raster-encode";
import { renderDesignSvg } from "./text";
import { ZIP_MIME, createZip, type ZipEntry } from "./zip";

/** Metadata of a bundle for the export dialog. */
export interface BundleInfo {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  /** Language of the optional snippet (for the code view). */
  snippet?: { labelKey: string; language: CodeLanguage; mime: string };
}

/** Whether the tool's render kind can produce the SVG its bundle images need. */
function bundleKindSupported(tool: AnyToolDefinition): boolean {
  return tool.render.kind === "svg" || tool.render.kind === "css";
}

/** The tool's bundles in declaration order (none without SVG output). */
export function listBundles(tool: AnyToolDefinition): BundleInfo[] {
  if (!bundleKindSupported(tool)) return [];
  return (tool.bundles ?? []).map((b) => ({
    id: b.id,
    labelKey: b.labelKey,
    ...(b.descriptionKey !== undefined ? { descriptionKey: b.descriptionKey } : {}),
    ...(b.snippet
      ? {
          snippet: {
            labelKey: b.snippet.labelKey,
            language: b.snippet.language,
            mime: CODE_LANGUAGE_FILES[b.snippet.language].mime,
          },
        }
      : {}),
  }));
}

function findBundle<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  id: string,
): BundleExport<Params<S>> {
  const bundles: readonly BundleExport<Params<S>>[] = tool.bundles ?? [];
  const bundle = bundles.find((b) => b.id === id);
  if (!bundle || !bundleKindSupported(tool as AnyToolDefinition)) {
    throw new ExportError("unknown-extra", `Tool "${tool.id}" has no bundle "${id}"`);
  }
  return bundle;
}

/** The files of a bundle for the current design (cheap: nothing is rendered). */
export function bundleFiles<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  id: string,
  params: Params<S>,
  ctx: RenderContext,
): readonly BundleFile<Params<S>>[] {
  return findBundle(tool, id).files(params, freshCtx(ctx));
}

/** The bundle's copyable snippet, or `null` when it has none. */
export function bundleSnippet<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  id: string,
  params: Params<S>,
  ctx: RenderContext,
): string | null {
  const snippet = findBundle(tool, id).snippet;
  return snippet ? snippet.render(params, freshCtx(ctx)) : null;
}

function freshCtx(ctx: RenderContext): RenderContext {
  return createRenderContext(ctx.seed, { width: ctx.width, height: ctx.height }, ctx.t);
}

let nextZipId = 1;

function zipInWorker(
  env: RasterEnv,
  entries: ZipEntry[],
  modified: Date,
  signal: AbortSignal | undefined,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let worker: WorkerLike;
    try {
      worker = env.createWorker();
    } catch (cause) {
      reject(new ExportError("unavailable", "Could not start the raster worker", { cause }));
      return;
    }
    const finish = (): void => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = (): void => {
      finish();
      reject(new ExportError("aborted", "Export aborted"));
    };
    worker.onmessage = (event) => {
      finish();
      const reply = event.data as EncodeResponse;
      if ("ok" in reply && reply.ok) resolve(reply.blob);
      else if ("ok" in reply) reject(new ExportError(reply.code, reply.message));
      else reject(new ExportError("unavailable", "Unexpected worker reply"));
    };
    worker.onerror = (event) => {
      finish();
      reject(new ExportError("unavailable", `Raster worker failed: ${event.message}`));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const message: ZipMessage = {
      kind: "zip",
      id: nextZipId++,
      entries,
      modified: modified.getTime(),
    };
    worker.postMessage(message, []);
  });
}

export interface BundleExportOptions {
  signal?: AbortSignal;
  /** 0 to 1. */
  onProgress?: (fraction: number) => void;
  /** Time stamp of the archive entries. Default: now. */
  modified?: Date;
}

export interface BundleExportResult {
  blob: Blob;
  /** `musterli-<toolId>-<seed>-<bundleId>.zip` */
  filename: string;
  /** Archive paths in order. */
  paths: string[];
}

/**
 * Renders, encodes and zips a bundle. Throws `ExportError` (as the raster
 * export, plus `unknown-extra` for an unknown bundle id).
 */
export async function exportBundle<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  id: string,
  params: Params<S>,
  ctx: RenderContext,
  options: BundleExportOptions = {},
  env?: RasterEnv,
): Promise<BundleExportResult> {
  const e = env ?? (await defaultRasterEnv());
  const { signal, onProgress } = options;
  const files = bundleFiles(tool, id, params, ctx);
  const encoder = new TextEncoder();
  // Images to rasterise, counted for progress (the ZIP is the last step).
  const steps =
    files.reduce((n, f) => n + (f.kind === "png" ? 1 : f.kind === "ico" ? f.sizes.length : 0), 0) +
    1;
  let done = 0;
  const step = (): void => {
    done++;
    onProgress?.(Math.min(done / steps, 0.99));
  };
  const png = async (width: number, height: number, p: Params<S>): Promise<Uint8Array> => {
    throwIfAborted(signal);
    const svg = renderDesignSvg(tool, p, createRenderContext(ctx.seed, { width, height }));
    const blob = await rasterizeSvg(
      svg,
      { format: "png", width, height, ...(signal ? { signal } : {}) },
      e,
    );
    step();
    return new Uint8Array(await blob.arrayBuffer());
  };

  onProgress?.(0);
  const entries: ZipEntry[] = [];
  for (const file of files) {
    switch (file.kind) {
      case "text":
        entries.push({ path: file.path, data: encoder.encode(file.text) });
        break;
      case "png":
        entries.push({
          path: file.path,
          data: await png(file.width, file.height, file.params ?? params),
        });
        break;
      case "ico": {
        const images = [];
        for (const edge of file.sizes) {
          images.push({
            width: edge,
            height: edge,
            png: await png(edge, edge, file.params ?? params),
          });
        }
        entries.push({ path: file.path, data: encodeIco(images) });
        break;
      }
    }
  }
  throwIfAborted(signal);
  const modified = options.modified ?? new Date();
  let blob: Blob;
  if (e.workerSupported()) {
    try {
      blob = await zipInWorker(e, entries, modified, signal);
    } catch (error) {
      // Only infrastructure problems fall back; real results are final.
      if (!(error instanceof ExportError) || error.code !== "unavailable") throw error;
      blob = new Blob(await createZip(entries, { modified }), { type: ZIP_MIME });
    }
  } else {
    blob = new Blob(await createZip(entries, { modified }), { type: ZIP_MIME });
  }
  throwIfAborted(signal);
  onProgress?.(1);
  return {
    blob,
    filename: exportFilename(tool.id, ctx.seed, "zip", id),
    paths: entries.map((entry) => entry.path),
  };
}
