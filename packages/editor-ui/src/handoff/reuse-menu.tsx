"use client";

/**
 * "Weiterverwenden" next to Export (M5b-AP04, docs/ARCHITECTURE.md 4.18):
 * a menu of every tool that takes a picture (derived from the tool
 * definitions, `listImageTargets`) and, for colour tools with a brand kit,
 * "Als Brand-Palette speichern". Choosing a tool renders the design through
 * the export's raster service at the size the target keeps, puts the
 * picture into the tab's hand-over store and opens the target tool with
 * the one-time token (`onOpenTool`, supplied by the app). Nothing here
 * knows a tool.
 */
import { isExportError, supportsExport } from "@musterli/exporters";
import {
  brandPaletteOutput,
  listImageTargets,
  registry as defaultRegistry,
  type AnyToolDefinition,
  type ImageTargetEntry,
} from "@musterli/tool-registry";
import { useLocale } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBrandKit } from "../brand-kit/context";
import { SavePaletteDialog } from "../brand-kit/save-palette-dialog";
import { resolveControl } from "../controls/resolve";
import { cx } from "../controls/primitives";
import type { ExportServices } from "../export/export-dialog";
import { useT } from "../i18n";
import { ChevronDownIcon, ForwardIcon } from "../shell/icons";
import { BUTTON_CLASS } from "../shell/styles";
import { useEditorStore, useEditorStoreApi } from "../store/react";
import { HandoffError, renderHandoffPicture, type HandoffTargetLimits } from "./picture";
import { handoffHash, handoffStore } from "./store";

export interface ReuseMenuProps {
  exportServices: ExportServices;
  /** Opens another tool's editor with `hash` (client-side navigation keeps the hand-over store). */
  onOpenTool?: ((toolId: string, hash: string) => void) | undefined;
  /** Visible and announced status (the shell's flash line). */
  onStatus(message: string): void;
  /** An error notice (the shell's notice bar). */
  onError(message: string): void;
  /** Where target tools are looked up. Default: the app-wide registry. */
  tools?: readonly AnyToolDefinition[];
  /** Whether the client has hydrated (disabled in the server HTML). */
  enabled: boolean;
}

/** What the target keeps: the limits of its image field, or of its image picker. */
export function targetLimits(
  tool: AnyToolDefinition,
  entry: ImageTargetEntry,
): HandoffTargetLimits | null {
  if (entry.slot.kind === "image-input") {
    return tool.imageInput ? { maxEdge: tool.imageInput.maxEdge, photo: false } : null;
  }
  const hints = tool.controls?.params as Record<string, object | undefined> | undefined;
  const control = resolveControl(tool, entry.slot.param, hints?.[entry.slot.param] ?? {});
  return control?.kind === "image" ? { maxEdge: control.maxEdge, photo: control.photo } : null;
}

const ITEM_CLASS = cx(
  "flex w-full cursor-default select-none flex-col items-start rounded-md px-2 py-1.5 text-left text-sm outline-none",
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50",
);

export function ReuseMenu(props: ReuseMenuProps) {
  const t = useT();
  const locale = useLocale();
  const store = useEditorStoreApi();
  const tool = useEditorStore((s) => s.tool);
  const params = useEditorStore((s) => s.params);
  const kit = useBrandKit();
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const allTools = props.tools ?? defaultRegistry.list();
  const byId = useMemo(() => new Map(allTools.map((t) => [t.id, t])), [allTools]);
  const canHandOver = props.onOpenTool !== undefined && supportsExport(tool, "png", params);
  const targets = useMemo(() => {
    if (!canHandOver) return [];
    const name = (id: string) => t(`tools.${id}.name`);
    return listImageTargets(allTools, tool.id)
      .map((entry) => ({
        entry,
        toolName: name(entry.toolId),
        slotName: t(entry.slot.labelKey),
      }))
      .sort((a, b) => a.toolName.localeCompare(b.toolName, locale));
  }, [canHandOver, allTools, tool.id, t, locale]);
  const palette = useMemo(
    () => (kit ? brandPaletteOutput(tool, params) : null),
    [kit, tool, params],
  );

  if (targets.length === 0 && palette === null) return null;

  const handOver = async (entry: ImageTargetEntry, toolName: string) => {
    const target = byId.get(entry.toolId);
    const limits = target ? targetLimits(target, entry) : null;
    if (!limits || !props.onOpenTool) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    props.onStatus(t("Editor.handoff.preparing", { tool: toolName }));
    const s = store.getState();
    try {
      const picture = await renderHandoffPicture(
        props.exportServices.exportRaster,
        s.tool,
        s.params,
        s.seed,
        s.size,
        limits,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const extension = picture.blob.type === "image/jpeg" ? "jpg" : "png";
      const put = await handoffStore.put({
        sourceToolId: s.tool.id,
        toolId: entry.toolId,
        param: entry.slot.kind === "param" ? entry.slot.param : null,
        blob: picture.blob,
        name: `musterli-${s.tool.id}-${s.seed}.${extension}`,
      });
      if (!put.ok) {
        props.onError(
          t(`Editor.handoff.errors.${put.error === "too-large" ? "too-large" : "failed"}`),
        );
        return;
      }
      props.onOpenTool(entry.toolId, handoffHash(put.token));
    } catch (error) {
      if (controller.signal.aborted) return;
      if (isExportError(error) && error.code === "aborted") return;
      const code =
        error instanceof HandoffError
          ? error.code
          : isExportError(error) && error.code === "too-large"
            ? "too-large"
            : "failed";
      props.onError(t(`Editor.handoff.errors.${code}`));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger
          ref={triggerRef}
          className={BUTTON_CLASS}
          disabled={!props.enabled || busy}
          aria-busy={busy || undefined}
          title={t(palette ? "Editor.handoff.buttonHintPalette" : "Editor.handoff.buttonHint")}
          data-testid="reuse-menu"
        >
          <ForwardIcon />
          {/* Icon only on narrow headers; the text stays the button's name. */}
          <span className="max-2xl:sr-only">{t("Editor.handoff.button")}</span>
          <ChevronDownIcon />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-[min(28rem,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          onCloseAutoFocus={(event) => {
            // The palette dialog takes the focus; the menu must not pull it back.
            if (openingDialog.current) {
              event.preventDefault();
              openingDialog.current = false;
            }
          }}
          data-testid="reuse-menu-content"
        >
          {targets.length > 0 && (
            <DropdownMenu.Group>
              <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {t("Editor.handoff.imageGroup")}
              </DropdownMenu.Label>
              {targets.map(({ entry, toolName, slotName }) => (
                <DropdownMenu.Item
                  key={`${entry.toolId}:${entry.slot.kind === "param" ? entry.slot.param : ""}`}
                  className={ITEM_CLASS}
                  onSelect={() => void handOver(entry, toolName)}
                  data-testid="reuse-target"
                  data-tool={entry.toolId}
                >
                  {/* Block children: screen readers hear "tool, field". */}
                  <div>
                    {toolName}
                    <span className="sr-only">,</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{slotName}</div>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Group>
          )}
          {targets.length > 0 && palette && (
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
          )}
          {palette && (
            <DropdownMenu.Group>
              <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {t("Editor.handoff.brandGroup")}
              </DropdownMenu.Label>
              <DropdownMenu.Item
                className={ITEM_CLASS}
                onSelect={() => {
                  openingDialog.current = true;
                  setPaletteOpen(true);
                }}
                data-testid="reuse-brand-palette"
              >
                {t("Editor.handoff.savePalette")}
              </DropdownMenu.Item>
            </DropdownMenu.Group>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      {kit && palette && (
        <SavePaletteDialog
          open={paletteOpen}
          onClose={() => {
            setPaletteOpen(false);
            triggerRef.current?.focus();
          }}
          kit={kit}
          colors={palette}
          defaultName={t("Editor.handoff.palette.defaultName", {
            tool: t(`tools.${tool.id}.name`),
          })}
        />
      )}
    </>
  );
}
