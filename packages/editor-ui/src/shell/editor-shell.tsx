"use client";

import { supportsExport } from "@motivo/exporters";
import {
  TRANSPARENT,
  createRenderContext,
  type AnyToolDefinition,
  type Params,
  type ParamsSchema,
} from "@motivo/tool-registry";
import { useDeferredValue, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { EditorControls } from "../controls/control-panel";
import { ExportDialog, browserExportServices, type ExportServices } from "../export/export-dialog";
import { buildShareUrl, useShareHash } from "../share/use-share";
import { cx } from "../controls/primitives";
import { useT } from "../i18n";
import { findMatchingPresetId, selectCanRedo, selectCanUndo } from "../store/editor-store";
import { useEditorStore, useEditorStoreApi } from "../store/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  KeyboardIcon,
  CloseIcon,
  LinkIcon,
  RedoIcon,
  ShuffleIcon,
  UndoIcon,
} from "./icons";
import { PreviewStage, ZOOM_LEVELS, type Zoom } from "./preview";
import { renderMotifCached } from "./render";
import { ShortcutHelp } from "./shortcut-help";
import { SizePicker } from "./size-picker";
import { BUTTON_CLASS, ICON_BUTTON, PRIMARY_BUTTON_CLASS, TILE_CLASS } from "./styles";
import { Thumbnail } from "./thumbnail";
import { useHydrated } from "./use-hydrated";
import { useEditorShortcuts } from "./use-shortcuts";

export interface EditorShellProps {
  /** Rendered before the title, e.g. a link back to the catalogue. */
  headerStart?: ReactNode;
  /** Browser side effects of export, copy and share; replaceable in tests. */
  exportServices?: ExportServices;
  className?: string;
}

/** A dismissible notice under the header (share link problems, copy fallbacks). */
interface ShellNotice {
  tone: "error" | "info";
  message: string;
  /** A share link to copy by hand when the clipboard failed. */
  url?: string;
}

/** How long the visible "Kopiert" confirmation stays. */
const FLASH_MS = 4000;

const PRESET_THUMB_EDGE = 72;
const VARIANT_THUMB_EDGE = 56;

/** Formats a scale as a percentage, e.g. 0.5 -> 50. */
const percent = (scale: number) => Math.round(scale * 100);

/**
 * The tool-agnostic editor (docs/DESIGN.md 2): header with history and
 * actions, preview with zoom and size, presets, controls and the variant
 * filmstrip, plus the keyboard shortcuts of DESIGN.md 4. Needs an
 * `EditorStoreProvider` above it.
 */
export function EditorShell({
  headerStart,
  exportServices = browserExportServices,
  className,
}: EditorShellProps) {
  const t = useT();
  const store = useEditorStoreApi();
  const tool = useEditorStore((s) => s.tool);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);

  const [zoom, setZoom] = useState<Zoom>("fit");
  const [shownScale, setShownScale] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // `id` restarts the fade timer when the same message is shown again.
  const [flash, setFlash] = useState<{ message: string; id: number } | null>(null);
  const [notice, setNotice] = useState<ShellNotice | null>(null);
  const [hashNotice, dismissHashNotice] = useShareHash(store);
  // Share only works once the client runs; disabled in the server HTML so a
  // click before hydration is not silently lost (and tests can wait for it).
  const hydrated = useHydrated();
  const ids = useId();

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  const toolName = t(`tools.${tool.id}.name`);

  // Announce the variant position whenever the active variant or the variant
  // count changes. Not on array identity: edits replace `variants` without
  // moving the position, and re-announcing then would be noise.
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (
          s.activeVariantId === prev.activeVariantId &&
          s.variants.length === prev.variants.length
        )
          return;
        const index = s.variants.findIndex((v) => v.id === s.activeVariantId);
        if (index === -1) return;
        setAnnouncement(
          t("Editor.shell.variantAnnouncement", { index: index + 1, count: s.variants.length }),
        );
      }),
    [store, t],
  );

  const actions = useMemo(() => {
    const get = store.getState;
    return {
      newVariant: () => get().newVariant(),
      undo: () => {
        if (!selectCanUndo(get())) return;
        get().undo();
        setAnnouncement(t("Editor.shell.undone"));
      },
      redo: () => {
        if (!selectCanRedo(get())) return;
        get().redo();
        setAnnouncement(t("Editor.shell.redone"));
      },
      previousVariant: () => get().previousVariant(),
      nextVariant: () => get().nextVariant(),
      zoomFit: () => setZoom("fit"),
      zoom100: () => setZoom(1),
      help: () => setHelpOpen(true),
      export: () => setExportOpen(true),
    };
  }, [store, t]);

  /** Visible and announced confirmation that fades after a few seconds. */
  const confirm = (message: string) => setFlash((f) => ({ message, id: (f?.id ?? 0) + 1 }));

  const share = async () => {
    const built = buildShareUrl(store, window.location.href);
    if (!built.ok) {
      setNotice({ tone: "error", message: t(`Editor.share.encodeErrors.${built.error}`) });
      return;
    }
    const result = await exportServices.copyText(built.url);
    if (result.ok) {
      setNotice(null);
      confirm(t("Editor.share.copied"));
    } else {
      setNotice({ tone: "error", message: t("Editor.share.copyFailed"), url: built.url });
    }
  };

  // ⌘/Ctrl+Shift+C: the current design as PNG (DESIGN.md 4), for tools that export PNG.
  const copyImage = supportsExport(tool, "png")
    ? () => {
        if (!exportServices.canCopyImage()) {
          setNotice({ tone: "error", message: t("Editor.export.copyUnavailableImage") });
          return;
        }
        const s = store.getState();
        const png = exportServices
          .exportRaster(
            s.tool,
            s.params as Params<ParamsSchema>,
            createRenderContext(s.seed, s.size),
            {
              format: "png",
            },
          )
          .then((r) => r.blob);
        // Created synchronously inside the key event, as Safari requires.
        const pending = exportServices.copyPng(png);
        void png.catch(() => undefined);
        void pending.then((result) => {
          if (result.ok) confirm(t("Editor.export.copiedPng"));
          else
            setNotice({ tone: "error", message: t(`Editor.export.copyErrors.${result.reason}`) });
        });
      }
    : undefined;

  useEditorShortcuts(copyImage ? { ...actions, copyImage } : actions);

  const shownNotice: ShellNotice | null =
    notice ??
    (hashNotice
      ? { tone: hashNotice.tone, message: t(`Editor.share.notices.${hashNotice.key}`) }
      : null);
  const dismissNotice = () => {
    setNotice(null);
    dismissHashNotice();
  };

  return (
    <div className={cx("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <div className="flex min-w-0 flex-[1_1_16rem] items-baseline gap-3">
          {headerStart}
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{toolName}</h1>
        </div>
        <div role="group" aria-label={t("Editor.shell.history")} className="flex gap-1">
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={actions.undo}
            disabled={!canUndo}
            aria-label={t("Editor.shell.undo")}
            title={`${t("Editor.shell.undo")} (⌘/Ctrl+Z)`}
            aria-keyshortcuts="Control+Z Meta+Z"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={actions.redo}
            disabled={!canRedo}
            aria-label={t("Editor.shell.redo")}
            title={`${t("Editor.shell.redo")} (⇧+⌘/Ctrl+Z)`}
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
          >
            <RedoIcon />
          </button>
        </div>
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={actions.newVariant}
          aria-keyshortcuts="Space"
          data-testid="new-variant"
        >
          <ShuffleIcon />
          {t("Editor.shell.newVariant")}
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          onClick={actions.help}
          aria-label={t("Editor.shortcuts.title")}
          aria-keyshortcuts="Shift+?"
          title={`${t("Editor.shortcuts.title")} (?)`}
        >
          <KeyboardIcon />
        </button>
        <span
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground"
          data-testid="shell-flash"
        >
          {flash?.message}
        </span>
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={() => void share()}
          disabled={!hydrated}
          title={t("Editor.share.hint")}
          data-testid="share-link"
        >
          <LinkIcon />
          {t("Editor.share.button")}
        </button>
        <button
          type="button"
          className={PRIMARY_BUTTON_CLASS}
          onClick={actions.export}
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+E Meta+E"
          title={`${t("Editor.shell.export")} (⌘/Ctrl+E)`}
        >
          <DownloadIcon />
          {t("Editor.shell.export")}
        </button>
      </div>

      {shownNotice && (
        <div
          role={shownNotice.tone === "error" ? "alert" : "status"}
          className={cx(
            "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2 text-sm",
            shownNotice.tone === "error" ? "bg-destructive/10" : "bg-muted",
          )}
          data-testid="shell-notice"
        >
          <p className="min-w-0 flex-[1_1_16rem]">{shownNotice.message}</p>
          {shownNotice.url !== undefined && (
            <>
              <label htmlFor={`${ids}-share-url`} className="sr-only">
                {t("Editor.share.linkLabel")}
              </label>
              <input
                id={`${ids}-share-url`}
                readOnly
                value={shownNotice.url}
                onFocus={(event) => event.currentTarget.select()}
                className="h-8 min-w-0 flex-[1_1_16rem] rounded-md border border-input bg-background px-2 text-xs"
              />
            </>
          )}
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={dismissNotice}
            aria-label={t("Editor.share.dismiss")}
          >
            <CloseIcon />
          </button>
        </div>
      )}

      <div
        className={cx(
          "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]",
          "lg:grid-cols-[13rem_minmax(0,1fr)_20rem] lg:grid-rows-[minmax(0,1fr)_auto]",
        )}
      >
        <PreviewSection
          zoom={zoom}
          onZoomChange={setZoom}
          shownScale={shownScale}
          onScaleChange={setShownScale}
          toolName={toolName}
        />
        <Filmstrip tool={tool} onPrevious={actions.previousVariant} onNext={actions.nextVariant} />
        <PresetBar />
        <section
          aria-labelledby={`${ids}-controls`}
          className="border-t border-border p-4 lg:col-start-3 lg:row-start-1 lg:overflow-y-auto lg:border-t-0 lg:border-l"
        >
          <h2 id={`${ids}-controls`} className="mb-3 text-sm font-semibold">
            {t("Editor.shell.settings")}
          </h2>
          <EditorControls />
        </section>
      </div>

      <p role="status" aria-live="polite" className="sr-only" data-testid="editor-announcer">
        {announcement}
      </p>
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        services={exportServices}
      />
    </div>
  );
}

function PreviewSection(props: {
  zoom: Zoom;
  onZoomChange(zoom: Zoom): void;
  shownScale: number | null;
  onScaleChange(scale: number): void;
  toolName: string;
}) {
  const t = useT();
  const headingId = useId();
  const tool = useEditorStore((s) => s.tool);
  const setSize = useEditorStore((s) => s.setSize);
  // Deferred: typing and dragging stay responsive, the preview follows.
  const params = useDeferredValue(useEditorStore((s) => s.params));
  const seed = useDeferredValue(useEditorStore((s) => s.seed));
  const size = useDeferredValue(useEditorStore((s) => s.size));
  const liveSize = useEditorStore((s) => s.size);

  const output = useMemo(
    () => renderMotifCached(tool, params, seed, size),
    [tool, params, seed, size],
  );
  const transparent = params.background === TRANSPARENT;

  const zoomButtons: { zoom: Zoom; label: string }[] = [
    { zoom: "fit", label: t("Editor.shell.zoomFit") },
    ...ZOOM_LEVELS.map((level) => ({
      zoom: level,
      label: t("Editor.shell.zoomPercent", { percent: percent(level) }),
    })),
  ];

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-0 flex-col lg:col-start-2 lg:row-start-1"
    >
      <h2 id={headingId} className="sr-only">
        {t("Editor.shell.preview")}
      </h2>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-2">
        <SizePicker size={liveSize} onChange={setSize} />
        <div className="flex min-w-0 items-center gap-2">
          <div role="group" aria-label={t("Editor.shell.zoom")} className="flex gap-1">
            {zoomButtons.map((b) => (
              <button
                key={String(b.zoom)}
                type="button"
                className={cx(BUTTON_CLASS, "px-2 aria-pressed:bg-accent")}
                aria-pressed={props.zoom === b.zoom}
                aria-keyshortcuts={b.zoom === "fit" ? "0" : b.zoom === 1 ? "1" : undefined}
                onClick={() => props.onZoomChange(b.zoom)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <output
            className="min-w-10 text-right text-xs text-muted-foreground tabular-nums"
            aria-label={t("Editor.shell.zoomCurrent")}
          >
            {props.shownScale === null
              ? ""
              : t("Editor.shell.zoomPercent", { percent: percent(props.shownScale) })}
          </output>
        </div>
      </div>
      <PreviewStage
        output={output}
        size={size}
        zoom={props.zoom}
        onZoomChange={props.onZoomChange}
        onScaleChange={props.onScaleChange}
        label={t("Editor.shell.previewAlt", {
          tool: props.toolName,
          width: size.width,
          height: size.height,
        })}
        transparent={transparent}
        unsupportedText={t("Editor.shell.unsupported")}
        className="h-[55dvh] min-h-64 lg:h-auto lg:min-h-0 lg:flex-1"
      />
    </section>
  );
}

function PresetBar() {
  const t = useT();
  const headingId = useId();
  const tool = useEditorStore((s) => s.tool);
  const params = useEditorStore((s) => s.params);
  const seed = useDeferredValue(useEditorStore((s) => s.seed));
  // Deferred like the preview: thumbnails follow size changes without blocking input.
  const size = useDeferredValue(useEditorStore((s) => s.size));
  const applyPreset = useEditorStore((s) => s.applyPreset);
  const activePreset = findMatchingPresetId(tool, params);

  if (tool.presets.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 border-t border-border p-4 lg:col-start-1 lg:row-start-1 lg:overflow-y-auto lg:border-t-0 lg:border-r"
    >
      <h2 id={headingId} className="mb-3 text-sm font-semibold">
        {t("Editor.shell.presets")}
      </h2>
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0">
        {tool.presets.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              className={cx(TILE_CLASS, "w-full")}
              aria-pressed={activePreset === preset.id}
              onClick={() => applyPreset(preset.id)}
              data-preset={preset.id}
              data-editor-tile=""
            >
              <span className="flex size-18 items-center justify-center overflow-hidden rounded-md bg-canvas">
                <Thumbnail
                  tool={tool}
                  params={preset.params as typeof params}
                  seed={preset.seed ?? seed}
                  size={size}
                  edge={PRESET_THUMB_EDGE}
                />
              </span>
              <span className="max-w-18 truncate">{t(preset.nameKey)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Filmstrip(props: { tool: AnyToolDefinition; onPrevious(): void; onNext(): void }) {
  const t = useT();
  const headingId = useId();
  const selectVariant = useEditorStore((s) => s.selectVariant);
  // Deferred like the preview, so a new variant's tile renders in the same
  // pass as the preview and reuses its output (see Thumbnail); size changes
  // never block input either.
  const variants = useDeferredValue(useEditorStore((s) => s.variants));
  const activeVariantId = useDeferredValue(useEditorStore((s) => s.activeVariantId));
  const size = useDeferredValue(useEditorStore((s) => s.size));
  const activeIndex = variants.findIndex((v) => v.id === activeVariantId);

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 items-center gap-2 border-t border-border px-4 py-2 lg:col-span-3 lg:row-start-2"
    >
      <h2 id={headingId} className="sr-only">
        {t("Editor.shell.variants")}
      </h2>
      <button
        type="button"
        className={ICON_BUTTON}
        onClick={props.onPrevious}
        // Without an active variant (design edited) both arrows jump to the
        // newest variant, exactly like the arrow keys.
        disabled={activeIndex === 0}
        aria-label={t("Editor.shell.previousVariant")}
        aria-keyshortcuts="ArrowLeft"
      >
        <ChevronLeftIcon />
      </button>
      <ol className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-1" data-testid="filmstrip">
        {variants.map((variant, index) => (
          <li key={variant.id}>
            <button
              type="button"
              className={TILE_CLASS}
              aria-current={index === activeIndex ? "true" : undefined}
              aria-label={t("Editor.shell.variantLabel", { index: index + 1 })}
              onClick={() => selectVariant(variant.id)}
              data-editor-tile=""
            >
              <span className="flex size-14 items-center justify-center overflow-hidden rounded-md bg-canvas">
                <Thumbnail
                  tool={props.tool}
                  params={variant.params}
                  seed={variant.seed}
                  size={size}
                  edge={VARIANT_THUMB_EDGE}
                />
              </span>
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={ICON_BUTTON}
        onClick={props.onNext}
        disabled={activeIndex !== -1 && activeIndex >= variants.length - 1}
        aria-label={t("Editor.shell.nextVariant")}
        aria-keyshortcuts="ArrowRight"
      >
        <ChevronRightIcon />
      </button>
      <p className="hidden text-xs text-muted-foreground sm:block">
        <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans">
          {t("Editor.shortcuts.keys.space")}
        </kbd>{" "}
        {t("Editor.shell.newVariantHint")}
      </p>
    </section>
  );
}
