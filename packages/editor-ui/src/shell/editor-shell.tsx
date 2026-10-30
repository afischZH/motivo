"use client";

import { supportsExport } from "@musterli/exporters";
import type { BrandKitStore, DesignStore } from "@musterli/storage";
import {
  TRANSPARENT,
  acceptsBrandPalette,
  createRenderContext,
  hasLocalContent,
  type AnyToolDefinition,
  type Params,
  type ParamsSchema,
} from "@musterli/tool-registry";
import { useLocale } from "next-intl";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AssetServicesContext } from "../asset-input/services-context";
import { BrandPaletteSection } from "../brand-kit/brand-palette-section";
import { BrandKitContext, orderedPalettes, useBrandKitView } from "../brand-kit/context";
import { EditorControls } from "../controls/control-panel";
import type { LocalDesignController, LocalDesignView } from "../designs/local-design";
import { useLocalDesign } from "../designs/use-local-design";
import { ExportDialog, browserExportServices, type ExportServices } from "../export/export-dialog";
import { ImageInputSection } from "../image-input/image-input-section";
import { ReuseMenu } from "../handoff/reuse-menu";
import { useHandoffReceiver, type HandoffOutcome } from "../handoff/use-handoff-receiver";
import { SuggestionsSection } from "./suggestions";
import type { ImageInputServices } from "../image-input/services";
import { buildShareUrl, useShareHash } from "../share/use-share";
import { Hint, HintProvider } from "../controls/hint";
import { FOCUS_RING, cx } from "../controls/primitives";
import { useT } from "../i18n";
import { findMatchingPresetId, selectCanRedo, selectCanUndo } from "../store/editor-store";
import { useEditorStore, useEditorStoreApi } from "../store/react";
import { valuesEqual } from "../store/values";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  FrameIcon,
  KeyboardIcon,
  CloseIcon,
  LinkIcon,
  RedoIcon,
  ResetIcon,
  SaveIcon,
  ShuffleIcon,
  SlidersIcon,
  TemplateIcon,
  UndoIcon,
} from "./icons";
import { PanelSection } from "./panel-section";
import { PreviewStage, type Zoom } from "./preview";
import { FLOATING_BAR_CLASS, ZoomDock } from "./zoom-dock";
import {
  ContextControls,
  ContextLayer,
  shownTone,
  supportsContextView,
  useContextContrast,
  type ContextToneChoice,
} from "./context-view";
import { LiveCaptureBar, LiveFrameLayer, useLiveView } from "./live-view";
import { RegionLayer, regionEditorOf } from "./region-editor";
import { renderMotifCached } from "./render";
import { ToolAdvisories } from "./advisories";
import { ShortcutHelp } from "./shortcut-help";
import { SizePicker } from "./size-picker";
import {
  BUTTON_CLASS,
  GHOST_ICON_BUTTON,
  ICON_BUTTON,
  PRIMARY_BUTTON_CLASS,
  TILE_CLASS,
} from "./styles";
import { Thumbnail } from "./thumbnail";
import { useHydrated } from "./use-hydrated";
import { publishEditorCommands, type EditorCommandHandlers } from "./command-bridge";
import { useEditorShortcuts } from "./use-shortcuts";

export interface EditorShellProps {
  /** Rendered before the title, e.g. a link back to the catalogue. */
  headerStart?: ReactNode;
  /** Browser side effects of export, copy and share; replaceable in tests. */
  exportServices?: ExportServices;
  /** Decoding and analysis of user images (tools with `imageInput`); replaceable in tests. */
  imageInputServices?: ImageInputServices;
  /** Quiet line in the export dialog after a successful export (see `ExportDialog`). */
  afterExport?: ReactNode;
  /**
   * Local saving (IndexedDB). Without it the editor has no save button, no
   * autosave draft and ignores `#design=` (tests, embeds).
   */
  designs?: DesignStore;
  /**
   * The brand kit (IndexedDB). With it, tools with colour params offer
   * "apply brand palette", colour pickers show brand swatches and upload
   * fields offer brand logos and shapes.
   */
  brandKit?: BrandKitStore;
  /** The Brand Kit page in the current locale, linked when it is empty. */
  brandKitHref?: string;
  /**
   * Opens another tool's editor with `hash` appended ("Weiterverwenden in",
   * docs/ARCHITECTURE.md 4.18). Must navigate client side, so the picture
   * handed over in this tab's memory is still there. Without it the editor
   * offers no hand-over (tests, embeds).
   */
  onOpenTool?: (toolId: string, hash: string) => void;
  /**
   * Opens the app's tool switcher (the pill with the tool name in the
   * header). Without it the pill only shows the name.
   */
  onSwitchTool?: () => void;
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

/**
 * The tool-agnostic editor (docs/DESIGN.md 2): header with history and
 * actions, preview with zoom and size, presets, controls and the variant
 * filmstrip, plus the keyboard shortcuts of DESIGN.md 4. Needs an
 * `EditorStoreProvider` above it.
 */
export function EditorShell({
  headerStart,
  exportServices = browserExportServices,
  imageInputServices,
  afterExport,
  designs,
  brandKit,
  brandKitHref,
  onOpenTool,
  onSwitchTool,
  className,
}: EditorShellProps) {
  const t = useT();
  const locale = useLocale();
  const store = useEditorStoreApi();
  const tool = useEditorStore((s) => s.tool);
  const currentParams = useEditorStore((s) => s.params);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);

  const [zoom, setZoom] = useState<Zoom>("fit");
  const [panels, togglePanel] = usePanels();
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

  const defaultName = useCallback(
    () =>
      t("Designs.editor.defaultName", {
        tool: toolName,
        date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(),
        ),
      }),
    [t, toolName, locale],
  );
  const local = useLocalDesign(store, designs, defaultName);
  const brandView = useBrandKitView(brandKit, brandKitHref);
  // A picture handed over from another tool lands once a saved design or draft has loaded.
  const incomingImage = useHandoffReceiver({
    store,
    ready: local ? local.view.ready : true,
    services: imageInputServices,
    onOutcome: (outcome: HandoffOutcome) => {
      const source = (id: string) => t(`tools.${id}.name`);
      switch (outcome.kind) {
        case "applied":
          confirm(t("Editor.handoff.received", { tool: source(outcome.sourceToolId) }));
          return;
        case "analysing":
          confirm(t("Editor.handoff.receivedAnalysis", { tool: source(outcome.sourceToolId) }));
          return;
        case "expired":
          setNotice({ tone: "info", message: t("Editor.handoff.expired") });
          return;
        case "rejected":
          setNotice({
            tone: "error",
            message: t("Editor.handoff.errors.received", {
              reason: t(`Editor.asset.errors.${outcome.error}`),
            }),
          });
      }
    },
  });

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
      const s = store.getState();
      // Uploads stay on this device: say so instead of sharing a different picture silently.
      setNotice(
        hasLocalContent(s.tool, s.params)
          ? { tone: "info", message: t("Editor.share.localLeftOut") }
          : null,
      );
      confirm(t("Editor.share.copied"));
    } else {
      setNotice({ tone: "error", message: t("Editor.share.copyFailed"), url: built.url });
    }
  };

  // ⌘/Ctrl+Shift+C: the current design as PNG (DESIGN.md 4), for tools that export PNG.
  const copyImage = supportsExport(tool, "png", currentParams)
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

  const save = local
    ? () => {
        void local.controller.save().then((ok) => {
          if (ok) confirm(t("Designs.editor.saved"));
        });
      }
    : undefined;

  useEditorShortcuts({
    ...actions,
    ...(copyImage ? { copyImage } : {}),
    ...(save ? { save } : {}),
  });

  // The command palette (⌘K) runs the same actions; the default brand palette in one step.
  const brandPalette =
    brandView && acceptsBrandPalette(tool) ? orderedPalettes(brandView)[0] : undefined;
  const commands: EditorCommandHandlers = {
    export: actions.export,
    newVariant: actions.newVariant,
    ...(save ? { save } : {}),
    ...(copyImage ? { copyImage } : {}),
    share: () => void share(),
    ...(brandPalette
      ? {
          applyBrandPalette: () => {
            if (store.getState().applyBrandPalette(brandPalette.colors)) {
              confirm(
                t("Editor.brand.applied", { name: brandPalette.name || t("Editor.brand.unnamed") }),
              );
            }
          },
        }
      : {}),
    undo: actions.undo,
    redo: actions.redo,
    help: actions.help,
  };
  const commandsRef = useRef(commands);
  useEffect(() => {
    commandsRef.current = commands;
  });
  const commandKeys = Object.keys(commands).join(",");
  useEffect(() => {
    const ids = commandKeys.split(",") as (keyof EditorCommandHandlers)[];
    return publishEditorCommands(
      Object.fromEntries(ids.map((id) => [id, () => commandsRef.current[id]?.()])),
    );
  }, [commandKeys]);

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
    <BrandKitContext.Provider value={brandView}>
      <HintProvider>
        <div className={cx("flex min-h-0 flex-1 flex-col", className)}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] lg:gap-4">
            <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-2">
              {headerStart}
              {local && save && (
                <DesignName controller={local.controller} view={local.view} enabled={hydrated} />
              )}
              <span
                role="status"
                aria-live="polite"
                className="min-w-0 truncate text-xs text-muted-foreground"
                data-testid="shell-flash"
              >
                {flash?.message}
              </span>
            </div>
            <ToolSwitcher toolName={toolName} onSwitch={onSwitchTool} />
            <div className="flex flex-wrap items-center justify-end gap-1.5 lg:flex-nowrap">
              <div role="group" aria-label={t("Editor.shell.history")} className="flex gap-0.5">
                <Hint label={t("Editor.shell.undo")} keys={["mod", "Z"]}>
                  <button
                    type="button"
                    className={GHOST_ICON_BUTTON}
                    onClick={actions.undo}
                    disabled={!canUndo}
                    aria-label={t("Editor.shell.undo")}
                    aria-keyshortcuts="Control+Z Meta+Z"
                  >
                    <UndoIcon />
                  </button>
                </Hint>
                <Hint label={t("Editor.shell.redo")} keys={["mod", "shift", "Z"]}>
                  <button
                    type="button"
                    className={GHOST_ICON_BUTTON}
                    onClick={actions.redo}
                    disabled={!canRedo}
                    aria-label={t("Editor.shell.redo")}
                    aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
                  >
                    <RedoIcon />
                  </button>
                </Hint>
                <Hint label={t("Editor.shortcuts.title")} keys={["?"]}>
                  <button
                    type="button"
                    className={GHOST_ICON_BUTTON}
                    onClick={actions.help}
                    aria-label={t("Editor.shortcuts.title")}
                    aria-keyshortcuts="Shift+?"
                  >
                    <KeyboardIcon />
                  </button>
                </Hint>
              </div>
              <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
              <Hint label={t("Editor.shell.newVariant")} keys={[t("Editor.shortcuts.keys.space")]}>
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  onClick={actions.newVariant}
                  aria-keyshortcuts="Space"
                  aria-label={t("Editor.shell.newVariant")}
                  data-testid="new-variant"
                >
                  <ShuffleIcon />
                  <span className="hidden min-[1760px]:inline">{t("Editor.shell.newVariant")}</span>
                </button>
              </Hint>
              <Hint label={t("Editor.share.hint")}>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  onClick={() => void share()}
                  disabled={!hydrated}
                  aria-label={t("Editor.share.button")}
                  data-testid="share-link"
                >
                  <LinkIcon />
                </button>
              </Hint>
              <ReuseMenu
                exportServices={exportServices}
                onOpenTool={onOpenTool}
                onStatus={confirm}
                onError={(message) => setNotice({ tone: "error", message })}
                enabled={hydrated}
              />
              {local && save && <SaveButton view={local.view} onSave={save} enabled={hydrated} />}
              <Hint label={t("Editor.shell.export")} keys={["mod", "E"]}>
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={actions.export}
                  aria-haspopup="dialog"
                  aria-keyshortcuts="Control+E Meta+E"
                >
                  <DownloadIcon />
                  {t("Editor.shell.export")}
                </button>
              </Hint>
            </div>
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

          {local?.view.notice && <DesignNotice controller={local.controller} view={local.view} />}

          <div
            className={cx(
              "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto]",
              PANEL_COLUMNS[`${panels.left ? 1 : 0}${panels.right ? 1 : 0}`],
            )}
          >
            <PreviewSection
              zoom={zoom}
              onZoomChange={setZoom}
              shownScale={shownScale}
              onScaleChange={setShownScale}
              toolName={toolName}
              panels={panels}
              onTogglePanel={togglePanel}
              leftPanelId={`${ids}-left`}
              rightPanelId={`${ids}-right`}
            />
            <Filmstrip
              tool={tool}
              onPrevious={actions.previousVariant}
              onNext={actions.nextVariant}
            />
            <div
              id={`${ids}-left`}
              className={cx(
                "min-w-0 border-t border-border bg-card lg:col-start-1 lg:row-start-1 lg:overflow-y-auto lg:border-t-0 lg:border-r",
                !panels.left && "lg:hidden",
              )}
              data-testid="left-panel"
            >
              <PresetBar />
              <CanvasSizeSection />
            </div>
            {/* WebKit counts a <select>'s clipped label text as page overflow on narrow screens. */}
            <section
              id={`${ids}-right`}
              aria-labelledby={`${ids}-controls`}
              className={cx(
                "overflow-x-clip border-t border-border bg-card px-4 pb-6 lg:col-start-3 lg:row-start-1 lg:overflow-y-auto lg:border-t-0 lg:border-l",
                !panels.right && "lg:hidden",
              )}
            >
              <div className="sticky top-0 z-10 -mx-4 flex h-12 items-center justify-between gap-2 border-b border-border bg-card/95 px-4 backdrop-blur-sm">
                <h2
                  id={`${ids}-controls`}
                  className="flex items-center gap-2.5 text-[13px] font-semibold"
                >
                  <span className="text-muted-foreground [&_svg]:size-4">
                    <SlidersIcon />
                  </span>
                  {t("Editor.shell.settings")}
                </h2>
                <ResetAllButton />
              </div>
              <ToolAdvisories />
              <BrandPaletteSection onApplied={confirm} />
              <SuggestionsSection onApplied={confirm} />
              <ImageInputSection services={imageInputServices} incoming={incomingImage} />
              <AssetServicesContext.Provider value={imageInputServices}>
                <EditorControls />
              </AssetServicesContext.Provider>
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
            afterExport={afterExport}
          />
        </div>
      </HintProvider>
    </BrandKitContext.Provider>
  );
}

/** Grid columns on large screens by panel state ("left right", 1 = shown). */
const PANEL_COLUMNS: Record<string, string> = {
  "11": "lg:grid-cols-[16rem_minmax(0,1fr)_21rem] xl:grid-cols-[17rem_minmax(0,1fr)_22rem]",
  "10": "lg:grid-cols-[16rem_minmax(0,1fr)_0px] xl:grid-cols-[17rem_minmax(0,1fr)_0px]",
  "01": "lg:grid-cols-[0px_minmax(0,1fr)_21rem] xl:grid-cols-[0px_minmax(0,1fr)_22rem]",
  "00": "lg:grid-cols-[0px_minmax(0,1fr)_0px]",
};

interface Panels {
  left: boolean;
  right: boolean;
}

/** Remembered in this browser only (no personal data, DESIGN.md 5). */
const PANELS_KEY = "musterli.editor.panels";
const BOTH_PANELS: Panels = { left: true, right: true };

let panelsCache: { raw: string | null; value: Panels } | null = null;
/** Used when storage is blocked, so the toggles still work on this page. */
let panelsInMemory: Panels | null = null;
const panelListeners = new Set<() => void>();

function readPanels(): Panels {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PANELS_KEY);
  } catch {
    return panelsInMemory ?? BOTH_PANELS;
  }
  if (panelsCache?.raw === raw) return panelsCache.value;
  let value = BOTH_PANELS;
  try {
    const saved = JSON.parse(raw ?? "null") as unknown;
    if (saved && typeof saved === "object") {
      const { left, right } = saved as Record<string, unknown>;
      if (typeof left === "boolean" && typeof right === "boolean") value = { left, right };
    }
  } catch {
    // Garbage: both panels open.
  }
  panelsCache = { raw, value };
  return value;
}

function subscribePanels(listener: () => void): () => void {
  panelListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    panelListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Which side panels are shown (large screens only; smaller screens stack
 * everything). Both open in the server HTML, then the last choice.
 */
function usePanels(): [Panels, (side: keyof Panels) => void] {
  const panels = useSyncExternalStore(subscribePanels, readPanels, () => BOTH_PANELS);
  const toggle = useCallback((side: keyof Panels) => {
    const prev = readPanels();
    const next = { ...prev, [side]: !prev[side] };
    try {
      window.localStorage.setItem(PANELS_KEY, JSON.stringify(next));
    } catch {
      panelsInMemory = next;
    }
    for (const listener of panelListeners) listener();
  }, []);
  return [panels, toggle];
}

/**
 * The tool name as a pill in the middle of the header. With `onSwitch` the
 * whole pill opens the app's tool switcher; the name stays the page's h1.
 */
function ToolSwitcher(props: { toolName: string; onSwitch?: (() => void) | undefined }) {
  const { toolName, onSwitch } = props;
  const t = useT();
  return (
    <div
      className={cx(
        "relative flex h-9 min-w-0 items-center gap-2 rounded-full border border-border bg-background ps-4 pe-2 shadow-xs transition-colors",
        onSwitch && "focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent",
        "max-lg:order-first max-lg:basis-full max-lg:justify-center lg:justify-self-center",
      )}
      data-testid="tool-switcher"
    >
      <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {t("Editor.shell.toolLabel")}
      </span>
      <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">{toolName}</h1>
      {onSwitch ? (
        <Hint label={t("Editor.shell.switchTool")} keys={["mod", "K"]}>
          <button
            type="button"
            onClick={onSwitch}
            aria-haspopup="dialog"
            aria-label={t("Editor.shell.switchTool")}
            // The ::after covers the whole pill, so the name is clickable too.
            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none after:absolute after:inset-0 after:rounded-full after:content-[''] [&_svg]:size-4"
            data-testid="switch-tool"
          >
            <ChevronsUpDownIcon />
          </button>
        </Hint>
      ) : (
        <span aria-hidden="true" className="w-2" />
      )}
    </div>
  );
}

/** The canvas size (presets and free width and height) as a left panel section. */
function CanvasSizeSection() {
  const t = useT();
  const tool = useEditorStore((s) => s.tool);
  const size = useEditorStore((s) => s.size);
  const setSize = useEditorStore((s) => s.setSize);
  return (
    <PanelSection title={t("Editor.shell.canvasSize")} icon={FrameIcon} data-testid="canvas-size">
      <SizePicker size={size} onChange={setSize} toolPresets={tool.sizePresets} />
    </PanelSection>
  );
}

/** Back to the tool defaults in one undoable step; disabled while nothing differs. */
function ResetAllButton() {
  const t = useT();
  const changed = useEditorStore((s) => !valuesEqual(s.params, s.tool.defaults));
  const resetParams = useEditorStore((s) => s.resetParams);
  return (
    <Hint label={t("Editor.controls.resetAllHint")}>
      <button
        type="button"
        className={cx(BUTTON_CLASS, "h-7 border-transparent px-2 text-xs text-muted-foreground")}
        onClick={resetParams}
        disabled={!changed}
        data-testid="reset-all"
      >
        <ResetIcon />
        {t("Editor.controls.resetAll")}
      </button>
    </Hint>
  );
}

/** The design name as an editable title, with its save state (DESIGN.md 2). */
function DesignName(props: {
  controller: LocalDesignController;
  view: LocalDesignView;
  enabled: boolean;
}) {
  const t = useT();
  const id = useId();
  const { controller, view } = props;
  const status =
    view.designId === null
      ? null
      : view.dirty
        ? t("Designs.editor.statusChanged")
        : t("Designs.editor.statusSaved");
  return (
    <div
      role="group"
      aria-label={t("Designs.editor.group")}
      className="flex min-w-0 flex-1 items-center gap-2"
      data-testid="design-bar"
    >
      <label htmlFor={`${id}-name`} className="sr-only">
        {t("Designs.editor.nameLabel")}
      </label>
      <input
        id={`${id}-name`}
        type="text"
        value={view.name}
        maxLength={120}
        placeholder={t("Designs.editor.namePlaceholder")}
        onChange={(event) => controller.setName(event.currentTarget.value)}
        onBlur={() => void controller.commitName()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void controller.commitName();
        }}
        disabled={!props.enabled}
        title={t("Designs.editor.nameLabel")}
        className={cx(
          "h-8 w-full max-w-56 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium transition-colors placeholder:text-muted-foreground",
          "hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        )}
        data-testid="design-name"
      />
      {status !== null && (
        <span
          className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          data-testid="design-status"
        >
          {status}
        </span>
      )}
    </div>
  );
}

/** Saves the design locally (⌘/Ctrl+S). */
function SaveButton(props: { view: LocalDesignView; onSave(): void; enabled: boolean }) {
  const t = useT();
  const { view } = props;
  return (
    <Hint label={t("Designs.editor.saveHint")} keys={["mod", "S"]}>
      <button
        type="button"
        className={BUTTON_CLASS}
        onClick={props.onSave}
        disabled={!props.enabled || !view.ready || view.saving}
        aria-keyshortcuts="Control+S Meta+S"
        data-testid="save-design"
      >
        <SaveIcon />
        {view.saving ? t("Designs.editor.saving") : t("Designs.editor.save")}
      </button>
    </Hint>
  );
}

/** Notice about drafts, old versions and storage problems, with its actions. */
function DesignNotice({
  controller,
  view,
}: {
  controller: LocalDesignController;
  view: LocalDesignView;
}) {
  const t = useT();
  const notice = view.notice;
  if (!notice) return null;
  const error = notice.kind === "error";
  const message = error
    ? t(`Designs.errors.${notice.code}`)
    : t(`Designs.editor.notices.${notice.kind}`);
  return (
    <div
      role={error ? "alert" : "status"}
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2 text-sm",
        error ? "bg-destructive/10" : "bg-muted",
      )}
      data-testid="design-notice"
    >
      <p className="min-w-0 flex-[1_1_16rem]">{message}</p>
      {notice.kind === "draft-restored" && (
        <button type="button" className={BUTTON_CLASS} onClick={() => controller.startNew()}>
          {t("Designs.editor.startNew")}
        </button>
      )}
      {notice.kind === "draft-available" && (
        <button type="button" className={BUTTON_CLASS} onClick={() => controller.restoreDraft()}>
          {t("Designs.editor.restore")}
        </button>
      )}
      <button
        type="button"
        className={ICON_BUTTON}
        onClick={() => controller.dismissNotice()}
        aria-label={t("Designs.editor.dismiss")}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function PreviewSection(props: {
  zoom: Zoom;
  onZoomChange(zoom: Zoom): void;
  shownScale: number | null;
  onScaleChange(scale: number): void;
  toolName: string;
  panels: Panels;
  onTogglePanel(side: keyof Panels): void;
  leftPanelId: string;
  rightPanelId: string;
}) {
  const t = useT();
  const headingId = useId();
  const tool = useEditorStore((s) => s.tool);
  // Deferred: typing and dragging stay responsive, the preview follows.
  const params = useDeferredValue(useEditorStore((s) => s.params));
  const seed = useDeferredValue(useEditorStore((s) => s.seed));
  const size = useDeferredValue(useEditorStore((s) => s.size));
  const liveSize = useEditorStore((s) => s.size);
  const liveParams = useEditorStore((s) => s.params);
  const liveSeed = useEditorStore((s) => s.seed);
  const regionEditor = regionEditorOf(tool);
  // Live frames follow the deferred render, so they sit where the preview shows the screens.
  const live = useLiveView(tool, params, seed, size);

  const output = useMemo(
    () => renderMotifCached(tool, params, seed, size),
    [tool, params, seed, size],
  );
  const transparent = params.background === TRANSPARENT;

  // "Im Kontext ansehen": the motif behind a mock website hero (W1-AP02).
  const contextAvailable = supportsContextView(tool);
  const [contextOn, setContextOn] = useState(false);
  const [toneChoice, setToneChoice] = useState<ContextToneChoice>("auto");
  const showContext = contextAvailable && contextOn;
  const ratios = useContextContrast(showContext, tool, params, seed, size);
  const tone = shownTone(toneChoice, ratios);

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-0 flex-col lg:col-start-2 lg:row-start-1"
    >
      <h2 id={headingId} className="sr-only">
        {t("Editor.shell.preview")}
      </h2>
      <div className="relative flex h-[55dvh] min-h-64 flex-col lg:h-auto lg:min-h-0 lg:flex-1">
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
          overlay={
            regionEditor || live.frames.length > 0 || showContext ? (
              <>
                {showContext && <ContextLayer tone={tone} />}
                {regionEditor && (
                  <RegionLayer
                    tool={tool}
                    editor={regionEditor}
                    params={liveParams}
                    seed={liveSeed}
                    size={liveSize}
                  />
                )}
                <LiveFrameLayer live={live} size={size} />
              </>
            ) : undefined
          }
          className="min-h-0 flex-1"
        />
        {/* Floating over the stage, outside its scroll area. */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
          <ZoomDock
            zoom={props.zoom}
            shownScale={props.shownScale}
            onZoomChange={props.onZoomChange}
          />
          {contextAvailable && (
            <div className={cx(FLOATING_BAR_CLASS, "ps-1 pe-3")}>
              <ContextControls
                on={contextOn}
                onToggle={() => setContextOn((on) => !on)}
                choice={toneChoice}
                onChoice={setToneChoice}
                ratio={ratios ? ratios[tone] : null}
              />
            </div>
          )}
        </div>
        <PanelToggle
          side="left"
          open={props.panels.left}
          controls={props.leftPanelId}
          onToggle={() => props.onTogglePanel("left")}
        />
        <PanelToggle
          side="right"
          open={props.panels.right}
          controls={props.rightPanelId}
          onToggle={() => props.onTogglePanel("right")}
        />
      </div>
      <LiveCaptureBar live={live} />
    </section>
  );
}

/** The round « / » button at a stage edge that hides or shows a side panel (large screens). */
function PanelToggle(props: {
  side: "left" | "right";
  open: boolean;
  controls: string;
  onToggle(): void;
}) {
  const t = useT();
  const label = t(`Editor.shell.panels.${props.side}${props.open ? "Hide" : "Show"}`);
  const pointsLeft = (props.side === "left") === props.open;
  return (
    <Hint label={label}>
      <button
        type="button"
        className={cx(
          "absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground lg:inline-flex [&_svg]:size-4",
          props.side === "left" ? "left-2" : "right-2",
          FOCUS_RING,
        )}
        aria-expanded={props.open}
        aria-controls={props.controls}
        aria-label={label}
        onClick={props.onToggle}
        data-testid={`toggle-${props.side}-panel`}
      >
        {pointsLeft ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
      </button>
    </Hint>
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
    <PanelSection title={t("Editor.shell.presets")} titleId={headingId} icon={TemplateIcon}>
      <section aria-labelledby={headingId} className="min-w-0">
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
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-canvas shadow-[inset_0_0_0_1px_oklch(0_0_0/0.06)]">
                  <Thumbnail
                    tool={tool}
                    params={preset.params as typeof params}
                    seed={preset.seed ?? seed}
                    size={size}
                    edge={PRESET_THUMB_EDGE}
                  />
                </span>
                <span className="w-full truncate text-center">{t(preset.nameKey)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </PanelSection>
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
      className="flex min-w-0 items-center gap-2 border-t border-border bg-card px-4 py-1.5 lg:col-span-3 lg:row-start-2"
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
              <span className="flex size-12 items-center justify-center overflow-hidden rounded-md bg-canvas">
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
