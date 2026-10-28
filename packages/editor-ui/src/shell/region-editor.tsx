"use client";

/**
 * Generic editing of single preview regions (M4-AP03), for tools with
 * `ToolDefinition.regionEditor` (e.g. the tiles of Geometric Patterns).
 * The shell knows nothing about tiles: regions, the form and the edits all
 * come from the tool.
 *
 * - Pointer: a click on the preview hit-tests the regions and opens the
 *   popover for the region under the pointer.
 * - Keyboard: one tab stop, a "cell picker" button that sits on the active
 *   region. Arrow keys move it to the nearest region in that direction
 *   (announced in a live region), Home/End jump to the first/last region,
 *   Enter or Space opens the popover.
 * - The popover is a modal dialog (Radix): focus is trapped inside, Escape
 *   or "Done" closes it and focus returns to the picker. Its form is built
 *   from the region schema like a list item sub-form. Each edit is one undo
 *   step (repeated changes of the same field, e.g. dragging a colour, merge).
 */
import {
  createRenderContext,
  type AnyToolDefinition,
  type CanvasSize,
  type PreviewRegion,
  type RegionEditor,
} from "@musterli/tool-registry";
import { Popover } from "radix-ui";
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { ControlForm } from "../controls/control-panel";
import { cx } from "../controls/primitives";
import { useT } from "../i18n";
import type { ParamValues } from "../store/editor-store";
import { useEditorStore, useEditorStoreApi } from "../store/react";
import { BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from "./styles";

type AnyRegionEditor = RegionEditor<ParamValues>;

/** The tool's region editor, type-erased for the shell. */
export function regionEditorOf(tool: AnyToolDefinition): AnyRegionEditor | undefined {
  return tool.regionEditor as AnyRegionEditor | undefined;
}

/** Index of the region that contains the point (design px), or -1. */
export function regionAt(regions: readonly PreviewRegion[], x: number, y: number): number {
  return regions.findIndex((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
}

/**
 * Region index after a navigation key, or `null` for other keys. Arrow keys
 * pick the nearest region whose centre lies past the edge in that direction (distance
 * along the axis plus twice the sideways offset, so the same row or column
 * wins); at the edge the region stays.
 */
export function regionKeyTarget(
  regions: readonly PreviewRegion[],
  index: number,
  key: string,
): number | null {
  if (regions.length === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return regions.length - 1;
  const dir =
    key === "ArrowRight"
      ? [1, 0]
      : key === "ArrowLeft"
        ? [-1, 0]
        : key === "ArrowDown"
          ? [0, 1]
          : key === "ArrowUp"
            ? [0, -1]
            : null;
  if (!dir) return null;
  const from = regions[index];
  if (!from) return 0;
  const [dx, dy] = dir as [number, number];
  const cx0 = from.x + from.width / 2;
  const cy0 = from.y + from.height / 2;
  let best = index;
  let bestScore = Number.POSITIVE_INFINITY;
  regions.forEach((r, i) => {
    if (i === index) return;
    const ox = r.x + r.width / 2 - cx0;
    const oy = r.y + r.height / 2 - cy0;
    const along = ox * dx + oy * dy;
    // The candidate's centre must lie past the current region's edge.
    const half = dx !== 0 ? from.width / 2 : from.height / 2;
    if (along <= half + 1e-6) return;
    const side = Math.abs(ox * dy - oy * dx);
    const score = along + 2 * side;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Position of a region on the preview box in percent (independent of the zoom). */
function boxStyle(r: PreviewRegion, size: CanvasSize): CSSProperties {
  return {
    position: "absolute",
    left: `${(r.x / size.width) * 100}%`,
    top: `${(r.y / size.height) * 100}%`,
    width: `${(r.width / size.width) * 100}%`,
    height: `${(r.height / size.height) * 100}%`,
  };
}

export interface RegionLayerProps {
  tool: AnyToolDefinition;
  editor: AnyRegionEditor;
  /** Current params, seed and size (live, so the edited state is never stale). */
  params: ParamValues;
  seed: number;
  size: CanvasSize;
}

/** Click and keyboard layer over the preview plus the edit popover. */
export function RegionLayer({ tool, editor, params, seed, size }: RegionLayerProps) {
  const t = useT();
  const ids = useId();
  const store = useEditorStoreApi();
  const commit = useEditorStore((s) => s.commit);
  const pickerRef = useRef<HTMLButtonElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const regions = useMemo(
    () => editor.regions(params, createRenderContext(seed, size)),
    [editor, params, seed, size],
  );
  const activeIndex = Math.max(
    0,
    regions.findIndex((r) => r.id === activeId),
  );
  const active = regions[activeIndex];
  const hover = hoverId === null ? undefined : regions.find((r) => r.id === hoverId);

  const labelOf = useCallback(
    (r: PreviewRegion): string => {
      const label = t(r.labelKey, r.labelValues ?? {});
      return r.edited ? t("Editor.regions.edited", { label }) : label;
    },
    [t],
  );

  const pointToDesign = (event: MouseEvent<HTMLElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * size.width,
      ((event.clientY - rect.top) / Math.max(1, rect.height)) * size.height,
    ];
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    // React bubbles events from the portalled popover through this layer: ignore them.
    if (!event.currentTarget.contains(event.target as Node)) return;
    // Keyboard activation of the picker (Enter/Space) has no pointer position.
    if (event.detail === 0) {
      if (active) setOpen(true);
      return;
    }
    const [x, y] = pointToDesign(event);
    const index = regionAt(regions, x, y);
    const region = regions[index];
    if (!region) return;
    setActiveId(region.id);
    setOpen(true);
  };

  const onPointerMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.target as Node)) return;
    const [x, y] = pointToDesign(event);
    const id = regions[regionAt(regions, x, y)]?.id ?? null;
    if (id !== hoverId) setHoverId(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = regionKeyTarget(regions, activeIndex, event.key);
    if (target === null) return;
    // Also keeps the arrow keys from browsing variants (the shortcut skips prevented events).
    event.preventDefault();
    const region = regions[target];
    if (!region) return;
    setActiveId(region.id);
    setAnnouncement(labelOf(region));
  };

  if (!active) return null;

  return (
    <div
      className="group/regions absolute inset-0 cursor-pointer"
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHoverId(null)}
      data-testid="region-layer"
    >
      {hover && !open && (
        <div
          aria-hidden="true"
          className="pointer-events-none rounded-[2px] outline-2 outline-offset-[-2px] outline-foreground/70 shadow-[inset_0_0_0_3px_var(--background)]"
          style={boxStyle(hover, size)}
        />
      )}
      {/* Edited regions are marked while the layer is hovered or focused, never in the plain preview. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 group-focus-within/regions:opacity-100 group-hover/regions:opacity-100"
      >
        {regions.map((r) =>
          r.edited ? (
            <span key={r.id} style={boxStyle(r, size)}>
              <span className="absolute top-0.5 right-0.5 size-2 rounded-full border border-background bg-primary" />
            </span>
          ) : null,
        )}
      </div>
      <Popover.Root
        open={open}
        modal
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) commit();
        }}
      >
        <Popover.Anchor asChild>
          <button
            ref={pickerRef}
            type="button"
            className={cx(
              "rounded-[2px] bg-transparent outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:shadow-[inset_0_0_0_4px_var(--background)]",
            )}
            style={boxStyle(active, size)}
            aria-label={labelOf(active)}
            aria-describedby={`${ids}-hint`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onKeyDown={onKeyDown}
            data-testid="region-picker"
            data-region={active.id}
          />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="center"
            sideOffset={8}
            collisionPadding={12}
            aria-labelledby={`${ids}-title`}
            aria-describedby={`${ids}-region`}
            onEscapeKeyDown={(event) => {
              // Escape in a nested native dialog (the crop dialog of an upload field) closes that one only.
              // Radix listens on the document and its preventDefault also cancels the native
              // dialog's own Escape handling, so the dialog gets its cancel event from here.
              const nested = (event.target as Element | null)?.closest?.("dialog[open]");
              if (nested) {
                event.preventDefault();
                nested.dispatchEvent(new Event("cancel", { cancelable: true }));
              }
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              pickerRef.current?.focus();
            }}
            className="z-50 grid max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[min(20rem,calc(100vw-24px))] gap-3 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
            data-testid="region-popover"
          >
            <RegionForm
              tool={tool}
              editor={editor}
              region={active}
              regionLabel={labelOf(active)}
              titleId={`${ids}-title`}
              regionId={`${ids}-region`}
              onAnnounce={setAnnouncement}
              onClose={() => {
                setOpen(false);
                commit();
              }}
              store={store}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <p id={`${ids}-hint`} className="sr-only">
        {t("Editor.regions.pickerHint")}
      </p>
      <p role="status" aria-live="polite" className="sr-only" data-testid="region-announcer">
        {announcement}
      </p>
    </div>
  );
}

function RegionForm(props: {
  tool: AnyToolDefinition;
  editor: AnyRegionEditor;
  region: PreviewRegion;
  regionLabel: string;
  titleId: string;
  regionId: string;
  store: ReturnType<typeof useEditorStoreApi>;
  onAnnounce(message: string): void;
  onClose(): void;
}) {
  const t = useT();
  const { editor, region, store } = props;
  // The live params (not the deferred preview copy), so quick edits never use stale values.
  const params = useEditorStore((s) => s.params);
  const seed = useEditorStore((s) => s.seed);
  const size = useEditorStore((s) => s.size);
  const ctx = useCallback(() => createRenderContext(seed, size), [seed, size]);
  const values = useMemo(
    () => editor.values(params, region.id, createRenderContext(seed, size)),
    [editor, params, region.id, seed, size],
  );
  const count = editor.editedCount(params);
  const blocked = !region.edited && count >= editor.maxEdited;

  const source = useMemo(
    () => ({
      id: props.tool.id,
      schema: editor.schema,
      defaults: values ?? {},
      controls: editor.controls,
    }),
    [props.tool.id, editor, values],
  );

  const apply = (next: ParamValues, coalesceKey?: string) => {
    const s = store.getState();
    if (next === s.params) return;
    s.setParams(next, coalesceKey === undefined ? undefined : { coalesceKey });
  };

  return (
    <>
      <div className="grid gap-0.5">
        <h2 id={props.titleId} className="text-sm font-semibold">
          {t(editor.titleKey)}
        </h2>
        <p id={props.regionId} className="text-xs text-muted-foreground">
          {props.regionLabel}
        </p>
      </div>
      {blocked && (
        <p role="status" className="rounded-md bg-muted p-2 text-xs" data-testid="region-limit">
          {t("Editor.regions.limit", { max: editor.maxEdited })}
        </p>
      )}
      {values && (
        <fieldset disabled={blocked} className="min-w-0">
          <ControlForm
            source={source}
            params={values}
            root={params}
            onChange={(key, value) => {
              const s = store.getState();
              apply(
                editor.set(s.params, region.id, { [key]: value }, ctx()),
                `region:${region.id}:${key}`,
              );
            }}
            onCommit={() => store.getState().commit()}
          />
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={!region.edited}
          onClick={() => {
            apply(editor.reset(store.getState().params, region.id));
            props.onAnnounce(t("Editor.regions.resetDone"));
          }}
          data-testid="region-reset"
        >
          {t("Editor.regions.resetRegion")}
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={count === 0}
          onClick={() => {
            apply(editor.reset(store.getState().params, null));
            props.onAnnounce(t("Editor.regions.resetAllDone"));
          }}
          data-testid="region-reset-all"
        >
          {t("Editor.regions.resetAll", { count })}
        </button>
        <button
          type="button"
          className={cx(PRIMARY_BUTTON_CLASS, "ml-auto")}
          onClick={props.onClose}
          data-testid="region-close"
        >
          {t("Editor.regions.close")}
        </button>
      </div>
    </>
  );
}
