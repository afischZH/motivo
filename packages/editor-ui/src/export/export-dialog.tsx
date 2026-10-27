"use client";

import {
  FILE_EXTENSIONS,
  canCopyImage,
  canCopyText,
  copyPng,
  copyText,
  downloadBlob,
  exportCss,
  exportExtra,
  exportFilename,
  exportRaster,
  exportSvg,
  resolveQuality,
  textBlob,
  MIME_TYPES,
  type RasterFormat,
} from "@motivo/exporters";
import {
  CANVAS_EDGE_MAX,
  CANVAS_EDGE_MIN,
  createRenderContext,
  type AnyToolDefinition,
  type CanvasSize,
  type Params,
  type ParamsSchema,
} from "@motivo/tool-registry";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { INPUT_CLASS, cx } from "../controls/primitives";
import { useT, type Translate } from "../i18n";
import type { ParamValues } from "../store/editor-store";
import { useEditorStore } from "../store/react";
import { parseEdge } from "../shell/size-picker";
import { BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from "../shell/styles";
import {
  EXPORT_CATEGORIES,
  EXPORT_SCALES,
  clipboardErrorKey,
  defaultJpgBackground,
  exportErrorKey,
  formatBytes,
  isTextChoice,
  listExportChoices,
  pickInitialChoice,
  planRasterSize,
  utf8Bytes,
  type ExportChoice,
  type ExportScale,
  type ExportSizeMode,
  type TextChoice,
} from "./export-model";

/** Browser side effects of the dialog, replaceable in tests. */
export interface ExportServices {
  exportRaster: typeof exportRaster;
  downloadBlob: typeof downloadBlob;
  copyText: typeof copyText;
  copyPng: typeof copyPng;
  canCopyText: typeof canCopyText;
  canCopyImage: typeof canCopyImage;
}

export const browserExportServices: ExportServices = {
  exportRaster,
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
}: ExportDialogProps) {
  const t = useT();
  const titleId = useId();
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
      onClick={(event) => {
        // A click on the backdrop targets the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
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
      {open && <ExportDialogBody services={services} />}
    </dialog>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "busy"; action: "download" | "copy"; progress: number | null }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string; hint?: string };

function ExportDialogBody({ services }: { services: ExportServices }) {
  const t = useT();
  const id = useId();
  const tool = useEditorStore((s) => s.tool);
  const params = useEditorStore((s) => s.params);
  const seed = useEditorStore((s) => s.seed);
  const size = useEditorStore((s) => s.size);

  const choices = useMemo(() => listExportChoices(tool), [tool]);
  const [choiceId, setChoiceId] = useState<string | undefined>(
    () => pickInitialChoice(choices, readRemembered())?.id,
  );
  const choice = choices.find((c) => c.id === choiceId) ?? choices[0];

  const [sizeMode, setSizeMode] = useState<ExportSizeMode>({ kind: "scale", scale: 1 });
  const [qualityPercent, setQualityPercent] = useState<Partial<Record<RasterFormat, number>>>({});
  const [jpgBackground, setJpgBackground] = useState(() => defaultJpgBackground(params.background));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // The body only mounts in the browser (after opening), so feature detection is safe here.
  const [clipboard] = useState(() => ({
    text: services.canCopyText(),
    image: services.canCopyImage(),
  }));
  const abortRef = useRef<AbortController | null>(null);

  // Closing the dialog cancels a running export.
  useEffect(() => () => abortRef.current?.abort(), []);

  const text = useMemo(() => {
    if (!choice || !isTextChoice(choice)) return null;
    try {
      return { ok: true as const, value: renderTextExport(tool, choice, params, seed, size) };
    } catch (error) {
      return { ok: false as const, key: exportErrorKey(error) };
    }
  }, [choice, tool, params, seed, size]);

  if (!choice) {
    return <p className="p-5 text-sm text-muted-foreground">{t("Editor.export.noFormats")}</p>;
  }

  const raster = choice.kind === "raster" ? choice.format : null;
  const plan = planRasterSize(size, sizeMode);
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
    const ctx = createRenderContext(seed, plan.render);
    const options: Parameters<typeof exportRaster>[3] = {
      format,
      size: { width: plan.output.width, height: plan.output.height },
      signal: controller.signal,
      onProgress: (fraction) => {
        if (!controller.signal.aborted) {
          setStatus({ kind: "busy", action, progress: fraction });
        }
      },
    };
    if (quality !== undefined) options.quality = quality;
    if (format === "jpg") options.background = jpgBackground;
    return services.exportRaster(tool, params as AnyParams, ctx, options);
  };

  const finishRaster = () => {
    abortRef.current = null;
  };

  const download = async () => {
    if (raster !== null) {
      try {
        const result = await startRaster(raster, "download");
        services.downloadBlob(result.blob, result.filename);
        setStatus({ kind: "done", message: t("Editor.export.downloaded") });
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
    setStatus(
      key === null
        ? { kind: "done", message: t("Editor.export.copied") }
        : { kind: "error", message: t(`Editor.export.copyErrors.${key}`) },
    );
  };

  // Copy: text always (if the API exists), images only as PNG via ClipboardItem.
  const copyBlockedKey: string | null =
    raster === null
      ? clipboard.text
        ? null
        : "copyUnavailableText"
      : raster !== "png"
        ? "copyOnlyPng"
        : clipboard.image
          ? null
          : "copyUnavailableImage";
  const copyDisabled = busy || copyBlockedKey !== null || text?.ok === false;
  const downloadDisabled = busy || text?.ok === false;

  return (
    <div className="grid max-h-[calc(100dvh-6rem)] gap-5 overflow-y-auto px-5 py-4">
      <FormatPicker choices={choices} selected={choice} onSelect={choose} disabled={busy} />

      {raster !== null && (
        <>
          <SizeSection
            design={size}
            mode={sizeMode}
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

      {text !== null && (
        <CodeView
          text={text.ok ? text.value : null}
          errorText={text.ok ? null : t(`Editor.export.errors.${text.key}`)}
          label={t("Editor.export.code")}
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
            {raster === null ? t("Editor.export.copyText") : t("Editor.export.copyImage")}
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
      </div>
    </div>
  );
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
  return choice.kind === "extra"
    ? t(choice.extra.labelKey)
    : t(`Editor.export.formats.${choice.id}`);
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
}) {
  const t = useT();
  const id = useId();
  const { design, mode, plan } = props;
  const custom = mode.kind === "custom";

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
        {option(
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
