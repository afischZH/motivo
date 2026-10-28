"use client";

import {
  FILE_EXTENSIONS,
  bundleFiles,
  bundleSnippet,
  canCopyImage,
  canCopyText,
  copyPng,
  copyText,
  downloadBlob,
  exportBundle,
  exportCss,
  exportExtra,
  exportFilename,
  exportGif,
  exportRaster,
  exportRasterTile,
  exportSvg,
  exportTile,
  resolveQuality,
  textBlob,
  GIF_DELAY_MAX,
  GIF_DELAY_MIN,
  GIF_DELAY_STEP,
  GIF_EDGES,
  GIF_FRAMES_MAX,
  GIF_FRAMES_MIN,
  GIF_PIXEL_BUDGET,
  MIME_TYPES,
  gifSize,
  type BundleInfo,
  type GifPlan,
  type RasterFormat,
} from "@musterli/exporters";
import {
  CANVAS_EDGE_MAX,
  CANVAS_EDGE_MIN,
  createRenderContext,
  type AnyToolDefinition,
  type CanvasSize,
  type Params,
  type ParamsSchema,
  type ToolSizePreset,
} from "@musterli/tool-registry";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { INPUT_CLASS, cx } from "../controls/primitives";
import { useT, type Translate } from "../i18n";
import type { ParamValues } from "../store/editor-store";
import { useEditorStore } from "../store/react";
import {
  CUSTOM_SIZE,
  SizePresetOptions,
  matchSizePreset,
  parseEdge,
  sizeOfOption,
} from "../shell/size-picker";
import { BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from "../shell/styles";
import {
  EXPORT_CATEGORIES,
  EXPORT_SCALES,
  clipboardErrorKey,
  defaultGifSettings,
  defaultJpgBackground,
  exportErrorKey,
  formatBytes,
  gifSourceLabelKey,
  isTextChoice,
  listExportChoices,
  pickInitialChoice,
  planGifExport,
  planRasterSize,
  utf8Bytes,
  type ExportChoice,
  type ExportScale,
  type ExportSizeMode,
  type GifSettings,
  type TextChoice,
} from "./export-model";
import { useBackdropClose } from "../shell/use-backdrop-close";

/** Browser side effects of the dialog, replaceable in tests. */
export interface ExportServices {
  exportRaster: typeof exportRaster;
  /** Repeat tile of seamless tools (scale only, the tile has its own size). */
  exportRasterTile: typeof exportRasterTile;
  /** Animated GIF (tools with `animation`); frames are encoded in a worker. */
  exportGif: typeof exportGif;
  /** Multi-file bundle as ZIP (tools with `bundles`); encoded in the raster worker. */
  exportBundle: typeof exportBundle;
  downloadBlob: typeof downloadBlob;
  copyText: typeof copyText;
  copyPng: typeof copyPng;
  canCopyText: typeof canCopyText;
  canCopyImage: typeof canCopyImage;
}

export const browserExportServices: ExportServices = {
  exportRaster,
  exportRasterTile,
  exportGif,
  exportBundle,
  downloadBlob,
  copyText,
  copyPng,
  canCopyText,
  canCopyImage,
};

/** localStorage key of the last used format (DESIGN.md 1.4: remember the most used format). */
export const EXPORT_FORMAT_STORAGE_KEY = "motivo.export.format";

/** Longest code shown in the dialog; copy and download always contain everything. */
export const CODE_PREVIEW_LIMIT = 20_000;

function readRemembered(): string | null {
  try {
    return window.localStorage.getItem(EXPORT_FORMAT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(id: string): void {
  try {
    window.localStorage.setItem(EXPORT_FORMAT_STORAGE_KEY, id);
  } catch {
    // Private mode or blocked storage: the default format is fine.
  }
}

type AnyParams = Params<ParamsSchema>;

/** Renders a text export with the tool's own render path. Throws `ExportError`. */
export function renderTextExport(
  tool: AnyToolDefinition,
  choice: TextChoice,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
): string {
  const ctx = createRenderContext(seed, size);
  // The store only holds params that passed the tool's schema.
  const p = params as AnyParams;
  switch (choice.kind) {
    case "svg":
      return exportSvg(tool, p, ctx);
    case "css":
      return exportCss(tool, p, ctx);
    case "extra":
      return exportExtra(tool, choice.extra.id, p, ctx);
  }
}

export interface ExportDialogProps {
  open: boolean;
  onClose(): void;
  services?: ExportServices;
  /**
   * A quiet line shown under the actions once something was downloaded or
   * copied (the app passes its donation hint). Never shown before, never
   * blocks anything; gone when the dialog closes.
   */
  afterExport?: ReactNode;
}

/**
 * Export dialog (docs/DESIGN.md 6). A native modal `<dialog>`: the browser
 * traps focus inside and closes it with Escape. The body mounts only while
 * open, so nothing is rendered or encoded in the background.
 */
export function ExportDialog({
  open,
  onClose,
  services = browserExportServices,
  afterExport,
}: ExportDialogProps) {
  const t = useT();
  const titleId = useId();
  const backdropClose = useBackdropClose(onClose);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      {...backdropClose}
      className={cx(
        "m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-lg",
        "backdrop:bg-background/70 backdrop:backdrop-blur-sm",
      )}
      data-testid="export-dialog"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <h2 id={titleId} className="text-base font-semibold">
          {t("Editor.export.title")}
        </h2>
        <button type="button" className={BUTTON_CLASS} onClick={onClose}>
          {t("Editor.export.close")}
        </button>
      </div>
      {open && <ExportDialogBody services={services} afterExport={afterExport} />}
    </dialog>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "busy"; action: "download" | "copy"; progress: number | null }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string; hint?: string };

function ExportDialogBody({
  services,
  afterExport,
}: {
  services: ExportServices;
  afterExport: ReactNode;
}) {
  const t = useT();
  const id = useId();
  const tool = useEditorStore((s) => s.tool);
  const params = useEditorStore((s) => s.params);
  const seed = useEditorStore((s) => s.seed);
  const size = useEditorStore((s) => s.size);

  const choices = useMemo(() => listExportChoices(tool, params), [tool, params]);
  const [choiceId, setChoiceId] = useState<string | undefined>(
    () => pickInitialChoice(choices, readRemembered())?.id,
  );
  const choice = choices.find((c) => c.id === choiceId) ?? choices[0];

  const [sizeMode, setSizeMode] = useState<ExportSizeMode>({ kind: "scale", scale: 1 });
  const [qualityPercent, setQualityPercent] = useState<Partial<Record<RasterFormat, number>>>({});
  const [jpgBackground, setJpgBackground] = useState(() => defaultJpgBackground(params.background));
  const [gifSettings, setGifSettings] = useState<GifSettings>(() => defaultGifSettings(tool));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Something was downloaded or copied since the dialog opened.
  const [exported, setExported] = useState(false);
  // The body only mounts in the browser (after opening), so feature detection is safe here.
  const [clipboard] = useState(() => ({
    text: services.canCopyText(),
    image: services.canCopyImage(),
  }));
  const abortRef = useRef<AbortController | null>(null);

  // Closing the dialog cancels a running export.
  useEffect(() => () => abortRef.current?.abort(), []);

  const text = useMemo(() => {
    if (!choice) return null;
    try {
      if (choice.kind === "bundle") {
        // The bundle's snippet (e.g. HTML head tags) is shown and copied like code.
        const value = bundleSnippet(
          tool,
          choice.bundle.id,
          params as AnyParams,
          createRenderContext(seed, size),
        );
        return value === null ? null : { ok: true as const, value };
      }
      if (!isTextChoice(choice)) return null;
      return { ok: true as const, value: renderTextExport(tool, choice, params, seed, size) };
    } catch (error) {
      return { ok: false as const, key: exportErrorKey(error) };
    }
  }, [choice, tool, params, seed, size]);

  const bundlePaths = useMemo(() => {
    if (choice?.kind !== "bundle") return null;
    try {
      return bundleFiles(
        tool,
        choice.bundle.id,
        params as AnyParams,
        createRenderContext(seed, size),
      ).map((file) => file.path);
    } catch {
      return null;
    }
  }, [choice, tool, params, seed, size]);

  if (!choice) {
    return <p className="p-5 text-sm text-muted-foreground">{t("Editor.export.noFormats")}</p>;
  }

  const raster = choice.kind === "raster" || choice.kind === "tile" ? choice.format : null;
  const gifChoice = choice.kind === "gif";
  const bundleChoice = choice.kind === "bundle" ? choice.bundle : null;
  const gifPlan = gifChoice ? planGifExport(size, gifSettings) : null;
  // Image formats (copy only works for PNG).
  const imageFormat = raster ?? (gifChoice ? "gif" : null);
  const tileChoice = choice.kind === "tile";
  const tileSize = tileChoice ? tileSizeOf(tool, params, seed, size) : null;
  // The tile has its own size and only scales; a custom size would cut it.
  const effectiveMode: ExportSizeMode =
    tileChoice && sizeMode.kind === "custom" ? { kind: "scale", scale: 1 } : sizeMode;
  const plan = planRasterSize(tileSize ?? size, effectiveMode);
  const quality =
    raster === null
      ? undefined
      : qualityPercent[raster] !== undefined
        ? (qualityPercent[raster] ?? 0) / 100
        : resolveQuality(raster);
  const busy = status.kind === "busy";

  const choose = (next: ExportChoice) => {
    setChoiceId(next.id);
    remember(next.id);
    if (status.kind !== "busy") setStatus({ kind: "idle" });
  };

  const fail = (error: unknown) => {
    const key = exportErrorKey(error);
    if (key === "aborted") {
      setStatus({ kind: "done", message: t("Editor.export.cancelled") });
      return;
    }
    setStatus({
      kind: "error",
      message: t(`Editor.export.errors.${key}`),
      ...(key === "encodeFailed" ? { hint: t("Editor.export.errors.encodeFailedHint") } : {}),
    });
  };

  const startRaster = (format: RasterFormat, action: "download" | "copy") => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: "busy", action, progress: null });
    const ctx = createRenderContext(seed, tileChoice ? size : plan.render);
    const options: Parameters<typeof exportRaster>[3] = {
      format,
      size:
        tileChoice && effectiveMode.kind === "scale"
          ? { scale: effectiveMode.scale }
          : { width: plan.output.width, height: plan.output.height },
      signal: controller.signal,
      onProgress: (fraction) => {
        if (!controller.signal.aborted) {
          setStatus({ kind: "busy", action, progress: fraction });
        }
      },
    };
    if (quality !== undefined) options.quality = quality;
    if (format === "jpg") options.background = jpgBackground;
    return tileChoice
      ? services.exportRasterTile(tool, params as AnyParams, ctx, options)
      : services.exportRaster(tool, params as AnyParams, ctx, options);
  };

  const finishRaster = () => {
    abortRef.current = null;
  };

  const startGif = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: "busy", action: "download", progress: null });
    return services.exportGif(tool, params as AnyParams, createRenderContext(seed, size), {
      source: gifSettings.source,
      frames: gifSettings.frames,
      delay: gifSettings.delay,
      loop: gifSettings.loop,
      edge: gifSettings.edge,
      signal: controller.signal,
      onProgress: (fraction) => {
        if (!controller.signal.aborted) {
          setStatus({ kind: "busy", action: "download", progress: fraction });
        }
      },
    });
  };

  const startBundle = (bundleId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: "busy", action: "download", progress: null });
    return services.exportBundle(
      tool,
      bundleId,
      params as AnyParams,
      createRenderContext(seed, size),
      {
        signal: controller.signal,
        onProgress: (fraction) => {
          if (!controller.signal.aborted) {
            setStatus({ kind: "busy", action: "download", progress: fraction });
          }
        },
      },
    );
  };

  const download = async () => {
    if (bundleChoice) {
      try {
        const result = await startBundle(bundleChoice.id);
        services.downloadBlob(result.blob, result.filename);
        setStatus({ kind: "done", message: t("Editor.export.downloaded") });
        setExported(true);
      } catch (error) {
        fail(error);
      } finally {
        finishRaster();
      }
      return;
    }
    if (gifChoice) {
      try {
        const result = await startGif();
        services.downloadBlob(result.blob, result.filename);
        setStatus({ kind: "done", message: t("Editor.export.downloaded") });
        setExported(true);
      } catch (error) {
        fail(error);
      } finally {
        finishRaster();
      }
      return;
    }
    if (raster !== null) {
      try {
        const result = await startRaster(raster, "download");
        services.downloadBlob(result.blob, result.filename);
        setStatus({ kind: "done", message: t("Editor.export.downloaded") });
        setExported(true);
      } catch (error) {
        fail(error);
      } finally {
        finishRaster();
      }
      return;
    }
    if (!isTextChoice(choice) || !text?.ok) return;
    const { mime, extension, suffix } = textFile(choice);
    services.downloadBlob(
      textBlob(text.value, mime),
      exportFilename(tool.id, seed, extension, suffix),
    );
    setStatus({ kind: "done", message: t("Editor.export.downloaded") });
    setExported(true);
  };

  const copy = async () => {
    if (raster === "png") {
      // The ClipboardItem must be created inside the click (Safari), so the
      // pending PNG is handed over before any await.
      const png = startRaster("png", "copy");
      const pending = services.copyPng(png.then((r) => r.blob));
      try {
        await png;
      } catch (error) {
        await pending;
        finishRaster();
        fail(error);
        return;
      }
      const result = await pending;
      finishRaster();
      const key = clipboardErrorKey(result);
      if (key === null) setExported(true);
      setStatus(
        key === null
          ? { kind: "done", message: t("Editor.export.copied") }
          : { kind: "error", message: t(`Editor.export.copyErrors.${key}`) },
      );
      return;
    }
    if (!text?.ok) return;
    const result = await services.copyText(text.value);
    const key = clipboardErrorKey(result);
    if (key === null) setExported(true);
    setStatus(
      key === null
        ? { kind: "done", message: t("Editor.export.copied") }
        : { kind: "error", message: t(`Editor.export.copyErrors.${key}`) },
    );
  };

  // Copy: text always (if the API exists), images only as PNG via ClipboardItem;
  // a bundle copies its snippet, a bundle without one copies nothing.
  const copyBlockedKey: string | null =
    bundleChoice !== null && text === null
      ? "copyBundleNone"
      : imageFormat === null
        ? clipboard.text
          ? null
          : "copyUnavailableText"
        : imageFormat !== "png"
          ? "copyOnlyPng"
          : clipboard.image
            ? null
            : "copyUnavailableImage";
  const copyDisabled = busy || copyBlockedKey !== null || text?.ok === false;
  const downloadDisabled = busy || text?.ok === false || gifPlan?.overBudget === true;

  return (
    <div className="grid max-h-[calc(100dvh-6rem)] gap-5 overflow-y-auto px-5 py-4">
      <FormatPicker choices={choices} selected={choice} onSelect={choose} disabled={busy} />

      {raster !== null && (
        <>
          <SizeSection
            design={tileSize ?? size}
            mode={effectiveMode}
            allowCustom={!tileChoice}
            toolPresets={tool.sizePresets}
            onChange={setSizeMode}
            plan={plan}
            disabled={busy}
          />
          {(raster === "jpg" || raster === "webp") && quality !== undefined && (
            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={`${id}-quality`} className="text-sm font-medium">
                  {t("Editor.export.quality")}
                </label>
                <output htmlFor={`${id}-quality`} className="text-sm tabular-nums">
                  {Math.round(quality * 100)}
                </output>
              </div>
              <input
                id={`${id}-quality`}
                type="range"
                min={10}
                max={100}
                step={1}
                value={Math.round(quality * 100)}
                disabled={busy}
                onChange={(event) =>
                  setQualityPercent((q) => ({ ...q, [raster]: Number(event.target.value) }))
                }
                className="w-full accent-primary"
              />
            </div>
          )}
          {raster === "jpg" && (
            <div className="flex items-center gap-3">
              <input
                id={`${id}-background`}
                type="color"
                value={jpgBackground}
                disabled={busy}
                onChange={(event) => setJpgBackground(event.target.value)}
                className="h-8 w-10 cursor-pointer rounded-md border border-input bg-background p-0.5"
                aria-describedby={`${id}-background-hint`}
              />
              <div className="grid">
                <label htmlFor={`${id}-background`} className="text-sm font-medium">
                  {t("Editor.export.background")}
                </label>
                <span id={`${id}-background-hint`} className="text-xs text-muted-foreground">
                  {t("Editor.export.backgroundHint")}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {gifChoice && gifPlan && (
        <GifSection
          tool={tool}
          design={size}
          settings={gifSettings}
          plan={gifPlan}
          onChange={setGifSettings}
          disabled={busy}
        />
      )}

      {bundleChoice !== null && <BundleSection bundle={bundleChoice} paths={bundlePaths} />}

      {text !== null && (
        <CodeView
          text={text.ok ? text.value : null}
          errorText={text.ok ? null : t(`Editor.export.errors.${text.key}`)}
          label={
            bundleChoice?.snippet !== undefined
              ? t(bundleChoice.snippet.labelKey)
              : t("Editor.export.code")
          }
        />
      )}

      <div className="grid gap-3 border-t border-border pt-4">
        <StatusLine status={status} />
        {busy && (
          <div className="flex items-center gap-3">
            <progress
              className="h-2 flex-1 accent-primary"
              aria-label={t("Editor.export.progress")}
              max={1}
              {...(status.progress === null ? {} : { value: status.progress })}
            />
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => abortRef.current?.abort()}
            >
              {t("Editor.export.cancel")}
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {copyBlockedKey !== null && (
            <p id={`${id}-copy-note`} className="mr-auto text-xs text-muted-foreground">
              {t(`Editor.export.${copyBlockedKey}`)}
            </p>
          )}
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => void copy()}
            disabled={copyDisabled}
            aria-describedby={copyBlockedKey !== null ? `${id}-copy-note` : undefined}
            data-testid="export-copy"
          >
            {imageFormat === null ? t("Editor.export.copyText") : t("Editor.export.copyImage")}
          </button>
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={() => void download()}
            disabled={downloadDisabled}
            data-testid="export-download"
          >
            {t("Editor.export.download")}
          </button>
        </div>
        {exported && afterExport !== undefined && (
          <div className="text-right text-xs text-muted-foreground" data-testid="export-after">
            {afterExport}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pixel size of the repeat tile at scale 1, or null when it cannot be built. */
function tileSizeOf(
  tool: AnyToolDefinition,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
): CanvasSize | null {
  try {
    const tile = exportTile(tool, params as AnyParams, createRenderContext(seed, size));
    return { width: Math.round(tile.width), height: Math.round(tile.height) };
  } catch {
    return null;
  }
}

function textFile(choice: TextChoice): { mime: string; extension: string; suffix?: string } {
  switch (choice.kind) {
    case "svg":
      return { mime: MIME_TYPES.svg, extension: FILE_EXTENSIONS.svg };
    case "css":
      return { mime: MIME_TYPES.css, extension: FILE_EXTENSIONS.css };
    case "extra":
      return {
        mime: choice.extra.mime,
        extension: choice.extra.extension,
        suffix: choice.extra.id,
      };
  }
}

/** Label of a format card. */
function choiceLabel(t: Translate, choice: ExportChoice): string {
  if (choice.kind === "extra") return t(choice.extra.labelKey);
  if (choice.kind === "bundle") return t(choice.bundle.labelKey);
  return t(`Editor.export.formats.${choice.id}`);
}

/** What a bundle contains: its description and the file names. */
function BundleSection(props: { bundle: BundleInfo; paths: readonly string[] | null }) {
  const t = useT();
  const id = useId();
  const { bundle, paths } = props;
  return (
    <section className="grid gap-2" aria-labelledby={id} data-testid="export-bundle">
      <h3 id={id} className="text-sm font-semibold">
        {t("Editor.export.bundle.files", { count: paths?.length ?? 0 })}
      </h3>
      {bundle.descriptionKey !== undefined && (
        <p className="text-xs text-muted-foreground">{t(bundle.descriptionKey)}</p>
      )}
      {paths !== null && (
        <ul className="flex flex-wrap gap-1.5" data-testid="export-bundle-files">
          {paths.map((path) => (
            <li
              key={path}
              className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs"
            >
              {path}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FormatPicker(props: {
  choices: readonly ExportChoice[];
  selected: ExportChoice;
  onSelect(choice: ExportChoice): void;
  disabled: boolean;
}) {
  const t = useT();
  const name = useId();
  return (
    <fieldset className="grid gap-3" disabled={props.disabled}>
      <legend className="mb-2 text-sm font-semibold">{t("Editor.export.format")}</legend>
      {EXPORT_CATEGORIES.map((category) => {
        const group = props.choices.filter((c) => c.category === category);
        if (group.length === 0) return null;
        return (
          <div
            key={category}
            role="group"
            aria-labelledby={`${name}-${category}`}
            className="grid gap-1.5"
          >
            <p id={`${name}-${category}`} className="text-xs font-medium text-muted-foreground">
              {t(`Editor.export.categories.${category}`)}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.map((choice) => {
                const inputId = `${name}-${choice.id}`;
                return (
                  <div key={choice.id}>
                    <input
                      id={inputId}
                      type="radio"
                      name={name}
                      value={choice.id}
                      checked={choice.id === props.selected.id}
                      onChange={() => props.onSelect(choice)}
                      className="peer sr-only"
                      data-format={choice.id}
                    />
                    <label
                      htmlFor={inputId}
                      className={cx(
                        "inline-flex h-9 cursor-pointer items-center rounded-md border border-border bg-background px-3 text-sm",
                        "hover:bg-accent peer-checked:border-primary peer-checked:bg-accent peer-checked:font-medium",
                        "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
                      )}
                    >
                      {choiceLabel(t, choice)}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

function SizeSection(props: {
  design: CanvasSize;
  mode: ExportSizeMode;
  onChange(mode: ExportSizeMode): void;
  plan: ReturnType<typeof planRasterSize>;
  disabled: boolean;
  /** False for the repeat tile: it only scales. */
  allowCustom?: boolean;
  /** The tool's own sizes, listed first among the common sizes. */
  toolPresets?: readonly ToolSizePreset[] | undefined;
}) {
  const t = useT();
  const id = useId();
  const { design, mode, plan, toolPresets } = props;
  const custom = mode.kind === "custom";
  const matched = custom ? matchSizePreset(mode, toolPresets, mode.preset) : CUSTOM_SIZE;
  const presetValue = matched === CUSTOM_SIZE ? "" : matched;

  const option = (key: string, checked: boolean, onSelect: () => void, label: ReactNode) => (
    <div key={key}>
      <input
        id={`${id}-${key}`}
        type="radio"
        name={`${id}-size`}
        checked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <label
        htmlFor={`${id}-${key}`}
        className={cx(
          "inline-flex h-8 cursor-pointer items-center rounded-md border border-border bg-background px-3 text-sm tabular-nums",
          "hover:bg-accent peer-checked:border-primary peer-checked:bg-accent peer-checked:font-medium",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        )}
      >
        {label}
      </label>
    </div>
  );

  return (
    <fieldset className="grid gap-2" disabled={props.disabled}>
      <legend className="mb-2 text-sm font-semibold">{t("Editor.export.size")}</legend>
      <div className="flex flex-wrap gap-2">
        {EXPORT_SCALES.map((scale: ExportScale) =>
          option(
            `x${scale}`,
            mode.kind === "scale" && mode.scale === scale,
            () => props.onChange({ kind: "scale", scale }),
            t("Editor.export.scale", {
              scale,
              width: design.width * scale,
              height: design.height * scale,
            }),
          ),
        )}
        {props.allowCustom !== false &&
          option(
            "custom",
            custom,
            () =>
              props.onChange({
                kind: "custom",
                width: plan.output.width,
                height: plan.output.height,
              }),
            t("Editor.export.customSize"),
          )}
      </div>
      {props.allowCustom !== false && (
        <div className="grid min-w-0 gap-1">
          <label htmlFor={`${id}-preset`} className="text-xs font-medium text-muted-foreground">
            {t("Editor.export.preset")}
          </label>
          <select
            id={`${id}-preset`}
            className={cx(INPUT_CLASS, "w-full min-w-0 pr-7")}
            value={presetValue}
            onChange={(event) => {
              const value = event.target.value;
              const size = sizeOfOption(value, toolPresets);
              if (size) props.onChange({ kind: "custom", ...size, preset: value });
            }}
          >
            <option value="">{t("Editor.export.presetNone")}</option>
            <SizePresetOptions toolPresets={toolPresets} />
          </select>
        </div>
      )}
      {custom && (
        <div className="flex flex-wrap items-end gap-2">
          <ExportEdgeInput
            // Remount on outside changes so the draft shows the new value.
            key={`w${mode.width}`}
            label={t("Editor.size.width")}
            value={mode.width}
            onCommit={(width) => props.onChange({ ...mode, width })}
          />
          <span aria-hidden="true" className="pb-1.5 text-sm text-muted-foreground">
            ×
          </span>
          <ExportEdgeInput
            key={`h${mode.height}`}
            label={t("Editor.size.height")}
            value={mode.height}
            onCommit={(height) => props.onChange({ ...mode, height })}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground tabular-nums" data-testid="export-output-size">
        {t("Editor.export.outputSize", {
          width: plan.output.width,
          height: plan.output.height,
        })}
        {plan.recomposed && <> {t("Editor.export.recomposed")}</>}
        {plan.clamped && <> {t("Editor.export.clamped", { max: CANVAS_EDGE_MAX })}</>}
      </p>
    </fieldset>
  );
}

function GifSection(props: {
  tool: AnyToolDefinition;
  design: CanvasSize;
  settings: GifSettings;
  plan: GifPlan;
  onChange(settings: GifSettings): void;
  disabled: boolean;
}) {
  const t = useT();
  const id = useId();
  const { tool, design, settings, plan } = props;
  const sources = tool.animation?.sources ?? [];
  const set = (patch: Partial<GifSettings>) => props.onChange({ ...settings, ...patch });

  const radio = (
    group: string,
    key: string,
    checked: boolean,
    onSelect: () => void,
    label: ReactNode,
  ) => (
    <div key={key}>
      <input
        id={`${id}-${group}-${key}`}
        type="radio"
        name={`${id}-${group}`}
        checked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <label
        htmlFor={`${id}-${group}-${key}`}
        className={cx(
          "inline-flex h-8 cursor-pointer items-center rounded-md border border-border bg-background px-3 text-sm tabular-nums",
          "hover:bg-accent peer-checked:border-primary peer-checked:bg-accent peer-checked:font-medium",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        )}
      >
        {label}
      </label>
    </div>
  );

  const slider = (
    key: string,
    label: string,
    value: number,
    shown: string,
    min: number,
    max: number,
    step: number,
    onValue: (value: number) => void,
  ) => (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
          {label}
        </label>
        <output htmlFor={`${id}-${key}`} className="text-sm tabular-nums">
          {shown}
        </output>
      </div>
      <input
        id={`${id}-${key}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onValue(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );

  const seconds = ((plan.frames * plan.delay) / 1000).toFixed(1);
  return (
    <fieldset className="grid gap-4" disabled={props.disabled} data-testid="export-gif">
      <legend className="sr-only">{t("Editor.export.gif.title")}</legend>
      {sources.length > 1 && (
        <div role="radiogroup" aria-labelledby={`${id}-source`} className="grid gap-1.5">
          <p id={`${id}-source`} className="text-sm font-semibold">
            {t("Editor.export.gif.source")}
          </p>
          <div className="flex flex-wrap gap-2">
            {sources.map((source) =>
              radio(
                "source",
                source,
                settings.source === source,
                () => set({ source }),
                t(gifSourceLabelKey(tool, source)),
              ),
            )}
          </div>
        </div>
      )}
      {slider(
        "frames",
        t("Editor.export.gif.frames"),
        settings.frames,
        String(settings.frames),
        GIF_FRAMES_MIN,
        GIF_FRAMES_MAX,
        1,
        (frames) => set({ frames }),
      )}
      {slider(
        "delay",
        t("Editor.export.gif.delay"),
        settings.delay,
        t("Editor.export.gif.delayValue", { ms: settings.delay }),
        GIF_DELAY_MIN,
        GIF_DELAY_MAX,
        GIF_DELAY_STEP,
        (delay) => set({ delay }),
      )}
      <div className="flex items-center gap-2">
        <input
          id={`${id}-loop`}
          type="checkbox"
          checked={settings.loop}
          onChange={(event) => set({ loop: event.target.checked })}
          className="size-4 accent-primary"
        />
        <label htmlFor={`${id}-loop`} className="text-sm font-medium">
          {t("Editor.export.gif.loop")}
        </label>
      </div>
      <div role="radiogroup" aria-labelledby={`${id}-edge`} className="grid gap-1.5">
        <p id={`${id}-edge`} className="text-sm font-semibold">
          {t("Editor.export.size")}
        </p>
        <div className="flex flex-wrap gap-2">
          {GIF_EDGES.map((edge) => {
            const s = gifSize(design, edge);
            return radio(
              "edge",
              String(edge),
              settings.edge === edge,
              () => set({ edge }),
              t("Editor.export.gif.edgeOption", { width: s.width, height: s.height }),
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums" data-testid="export-gif-summary">
        {t("Editor.export.gif.summary", {
          width: plan.width,
          height: plan.height,
          frames: plan.frames,
          seconds,
        })}
      </p>
      {plan.overBudget && (
        <p role="alert" className="text-sm text-destructive" data-testid="export-gif-budget">
          {t("Editor.export.gif.overBudget", {
            max: Math.max(GIF_FRAMES_MIN, Math.min(GIF_FRAMES_MAX, plan.maxFrames)),
            megapixels: Math.round(GIF_PIXEL_BUDGET / 1_000_000),
          })}
        </p>
      )}
    </fieldset>
  );
}

function ExportEdgeInput(props: { label: string; value: number; onCommit(value: number): void }) {
  const t = useT();
  const id = useId();
  const [draft, setDraft] = useState(String(props.value));
  const parsed = parseEdge(draft);
  const invalid = parsed === null;

  const commit = () => {
    if (parsed !== null && parsed !== props.value) props.onCommit(parsed);
  };

  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {props.label}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          className={cx(INPUT_CLASS, "w-20 text-right")}
          value={draft}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // Enter must not submit or close anything.
              event.preventDefault();
              commit();
            }
          }}
        />
        <span className="text-xs text-muted-foreground">px</span>
      </div>
      {invalid && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {t("Editor.size.invalid", { min: CANVAS_EDGE_MIN, max: CANVAS_EDGE_MAX })}
        </p>
      )}
    </div>
  );
}

function CodeView(props: { text: string | null; errorText: string | null; label: string }) {
  const t = useT();
  const id = useId();
  if (props.text === null) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {props.errorText}
      </p>
    );
  }
  const bytes = formatBytes(utf8Bytes(props.text));
  const truncated = props.text.length > CODE_PREVIEW_LIMIT;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span id={id} className="text-sm font-semibold">
          {props.label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums" data-testid="export-file-size">
          {t("Editor.export.fileSize", { value: bytes.value, unit: bytes.unit })}
        </span>
      </div>
      <pre
        // Focusable so keyboard users can scroll long code.
        tabIndex={0}
        role="region"
        aria-labelledby={id}
        className="max-h-56 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        data-testid="export-code"
      >
        {truncated ? `${props.text.slice(0, CODE_PREVIEW_LIMIT)}…` : props.text}
      </pre>
      {truncated && (
        <p className="text-xs text-muted-foreground">{t("Editor.export.codeTruncated")}</p>
      )}
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  const t = useT();
  // Always mounted, so screen readers announce changes ("Kopiert").
  return (
    <div className="min-h-5 text-sm" data-testid="export-status">
      <p role="status" aria-live="polite" className="text-muted-foreground">
        {status.kind === "done"
          ? status.message
          : status.kind === "busy"
            ? t(status.action === "copy" ? "Editor.export.copying" : "Editor.export.working")
            : ""}
      </p>
      <div role="alert" className="text-destructive">
        {status.kind === "error" && (
          <>
            <p>{status.message}</p>
            {status.hint !== undefined && <p className="text-xs">{status.hint}</p>}
          </>
        )}
      </div>
    </div>
  );
}
