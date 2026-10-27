"use client";

import { TRANSPARENT, type AnyToolDefinition, type CanvasSize } from "@motivo/tool-registry";
import { useDeferredValue, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { EditorControls } from "../controls/control-panel";
import { cx } from "../controls/primitives";
import { useT } from "../i18n";
import {
  findMatchingPresetId,
  selectCanRedo,
  selectCanUndo,
  type Variant,
} from "../store/editor-store";
import { useEditorStore, useEditorStoreApi } from "../store/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  KeyboardIcon,
  RedoIcon,
  ShuffleIcon,
  UndoIcon,
} from "./icons";
import { PreviewStage, ZOOM_LEVELS, type Zoom } from "./preview";
import { renderMotif } from "./render";
import { ShortcutHelp } from "./shortcut-help";
import { SizePicker } from "./size-picker";
import { BUTTON_CLASS, ICON_BUTTON, PRIMARY_BUTTON_CLASS, TILE_CLASS } from "./styles";
import { Thumbnail } from "./thumbnail";
import { useEditorShortcuts } from "./use-shortcuts";

export interface EditorShellProps {
  /** Rendered before the title, e.g. a link back to the catalogue. */
  headerStart?: ReactNode;
  /** Opens the export dialog. Without it the Export button is shown disabled (M1-AP05). */
  onExport?: () => void;
  className?: string;
}

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
export function EditorShell({ headerStart, onExport, className }: EditorShellProps) {
  const t = useT();
  const store = useEditorStoreApi();
  const tool = useEditorStore((s) => s.tool);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const size = useEditorStore((s) => s.size);
  const variants = useEditorStore((s) => s.variants);
  const activeVariantId = useEditorStore((s) => s.activeVariantId);

  const [zoom, setZoom] = useState<Zoom>("fit");
  const [shownScale, setShownScale] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();

  const toolName = t(`tools.${tool.id}.name`);
  const activeIndex = variants.findIndex((v) => v.id === activeVariantId);

  // Announce the variant position whenever the active variant changes.
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.activeVariantId === prev.activeVariantId && s.variants === prev.variants) return;
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
    };
  }, [store, t]);

  useEditorShortcuts(onExport ? { ...actions, export: onExport } : actions);

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
        <button
          type="button"
          className={PRIMARY_BUTTON_CLASS}
          onClick={onExport}
          disabled={!onExport}
          title={onExport ? undefined : t("Editor.shell.exportSoon")}
          aria-describedby={onExport ? undefined : `${ids}-export-soon`}
        >
          <DownloadIcon />
          {t("Editor.shell.export")}
        </button>
        {!onExport && (
          <span id={`${ids}-export-soon`} className="sr-only">
            {t("Editor.shell.exportSoon")}
          </span>
        )}
      </div>

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
        <Filmstrip
          tool={tool}
          size={size}
          variants={variants}
          activeIndex={activeIndex}
          onPrevious={actions.previousVariant}
          onNext={actions.nextVariant}
        />
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

  const output = useMemo(() => renderMotif(tool, params, seed, size), [tool, params, seed, size]);
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
  const size = useEditorStore((s) => s.size);
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

function Filmstrip(props: {
  tool: AnyToolDefinition;
  size: CanvasSize;
  variants: readonly Variant[];
  activeIndex: number;
  onPrevious(): void;
  onNext(): void;
}) {
  const t = useT();
  const headingId = useId();
  const selectVariant = useEditorStore((s) => s.selectVariant);
  const { variants, activeIndex } = props;

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
        disabled={activeIndex <= 0}
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
            >
              <span className="flex size-14 items-center justify-center overflow-hidden rounded-md bg-canvas">
                <Thumbnail
                  tool={props.tool}
                  params={variant.params}
                  seed={variant.seed}
                  size={props.size}
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
        disabled={activeIndex === -1 || activeIndex >= variants.length - 1}
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
