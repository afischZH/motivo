"use client";

/**
 * Generic list control (M2-AP04) for params that are arrays of objects,
 * e.g. the layers of the CSS pattern tool. Tool-agnostic: names, previews
 * and the sub-form come from the item schema and its `ListHint`.
 *
 * - The list shows one row per item (top first) with a select button and,
 *   with `visibilityField`, a show/hide toggle (`aria-pressed`).
 * - Below the list, buttons act on the selected item: add, duplicate, move
 *   up/down, remove. Limits come from the schema (`min`/`max`).
 * - Keyboard on a row: Up/Down/Home/End select, Alt+Up/Down move,
 *   Delete/Backspace remove.
 * - Every operation is announced once in a polite live region (never on
 *   field edits), and focus lands on a sensible row afterwards.
 * - The selected item's fields are edited in a sub-form rendered by the
 *   caller (`renderForm`), so the panel's normal controls are reused.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "../i18n";
import { cssToStyle, parseCssDeclarations, svgDataUrl } from "../shell/render";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  TrashIcon,
} from "../shell/icons";
import type { ParamValues } from "../store/editor-store";
import { selectionAfter, type ListItem, type ListOp } from "../store/list";
import { FOCUS_RING, ICON_BUTTON_CLASS, cx } from "./primitives";
import { resolveControl, type ListControl, type ThumbnailControl } from "./resolve";

export interface ListFieldProps {
  control: ListControl;
  items: readonly ListItem[];
  /** The whole tool params (previews may depend on them). */
  root: ParamValues;
  /** Id of the list's visible label. */
  labelId: string;
  /** Applies an operation; false when it does not apply. */
  onListOp(op: ListOp): boolean;
  /** Sub-form for the selected item. */
  renderForm(index: number, item: ListItem, headingId: string): ReactNode;
}

type Action = "add" | "duplicate" | "up" | "down" | "remove";

/** Where focus goes after the next render. */
type FocusTarget = { kind: "row"; index: number } | { kind: "action"; action: Action };

/** Display name and optional preview of an item, from its `titleField`. */
function useItemTitle(control: ListControl, root: ParamValues) {
  const t = useT();
  const field = control.titleField;
  const hint = field ? control.item.controls?.params?.[field] : undefined;
  return (item: ListItem): { name?: string; preview?: ReturnType<ThumbnailControl["preview"]> } => {
    if (!field) return {};
    const resolved = resolveControl(control.item, field, hint ?? {}, { params: item, root });
    if (!resolved || !("options" in resolved)) return {};
    const option = resolved.options.find((o) => o.value === item[field]);
    const out: { name?: string; preview?: ReturnType<ThumbnailControl["preview"]> } = {};
    if (option) out.name = t(option.labelKey);
    if (resolved.kind === "thumbnails" && option) out.preview = resolved.preview(option.value);
    return out;
  };
}

function Swatch({ preview }: { preview: ReturnType<ThumbnailControl["preview"]> | undefined }) {
  const box = "relative size-7 shrink-0 overflow-hidden rounded border border-border bg-muted";
  if (!preview) return <span aria-hidden="true" className={box} />;
  if ("svg" in preview) {
    return (
      <span aria-hidden="true" className={box}>
        <img src={svgDataUrl(preview.svg)} alt="" className="size-full" draggable={false} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={box}>
      <span className="absolute inset-0" style={cssToStyle(parseCssDeclarations(preview.css))} />
    </span>
  );
}

export function ListField(props: ListFieldProps) {
  const t = useT();
  const { control, items } = props;
  const baseId = useId();
  const [selectedRaw, setSelected] = useState(0);
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const actions = useRef<Partial<Record<Action, HTMLButtonElement | null>>>({});
  const pendingFocus = useRef<FocusTarget | null>(null);
  const title = useItemTitle(control, props.root);

  const count = items.length;
  const selected = Math.max(0, Math.min(selectedRaw, count - 1));
  const item = items[selected];
  const visibility = control.visibilityField;

  const itemLabel = (index: number) => t(control.itemLabelKey, { index: index + 1 });
  /** What an announcement calls an item: its title (stable across moves) or its label. */
  const spokenName = (it: ListItem | undefined, index: number) =>
    (it && title(it).name) ?? itemLabel(index);

  const can: Record<Action, boolean> = {
    add: count < control.maxItems,
    duplicate: count < control.maxItems && item !== undefined,
    up: selected > 0,
    down: selected < count - 1,
    remove: count > control.minItems && item !== undefined,
  };

  // Focus after the list has re-rendered with the new items.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.kind === "row") {
      rows.current[target.index]?.focus();
      return;
    }
    const button = actions.current[target.action];
    if (button && !button.disabled) button.focus();
    else rows.current[selected]?.focus();
  });

  const announce = (text: string) => setAnnouncement((a) => ({ text, n: a.n + 1 }));

  const run = (op: ListOp, message: string, focus: FocusTarget | "selection") => {
    const before = count;
    if (!props.onListOp(op)) return;
    const next = selectionAfter(op, before);
    setSelected(next);
    pendingFocus.current = focus === "selection" ? { kind: "row", index: next } : focus;
    announce(message);
  };

  const add = (focus: FocusTarget | "selection" = "selection") =>
    run({ type: "add", at: 0 }, t("Editor.list.added", { item: itemLabel(0) }), focus);

  const duplicate = (index: number, focus: FocusTarget | "selection" = "selection") =>
    run(
      { type: "duplicate", index },
      t("Editor.list.duplicated", { item: itemLabel(index), copy: itemLabel(index + 1) }),
      focus,
    );

  const move = (index: number, to: number, focus: FocusTarget | "selection" = "selection") => {
    if (to < 0 || to >= count) return;
    run(
      { type: "move", from: index, to },
      t("Editor.list.moved", {
        item: spokenName(items[index], index),
        position: to + 1,
        count,
      }),
      focus,
    );
  };

  const remove = (index: number) =>
    run(
      { type: "remove", index },
      t("Editor.list.removed", { item: spokenName(items[index], index) }),
      "selection",
    );

  const toggleVisible = (index: number) => {
    const it = items[index];
    if (!visibility || !it) return;
    const visible = it[visibility] !== false;
    if (props.onListOp({ type: "set", index, field: visibility, value: !visible })) {
      announce(
        t(visible ? "Editor.list.hidden" : "Editor.list.shown", { item: itemLabel(index) }),
      );
    }
  };

  const onRowKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.metaKey) return;
    const focusRow = (i: number) => {
      event.preventDefault();
      setSelected(i);
      rows.current[i]?.focus();
    };
    if (event.altKey) {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(index, index - 1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        move(index, index + 1);
      }
      return;
    }
    switch (event.key) {
      case "ArrowUp":
        if (index > 0) focusRow(index - 1);
        else event.preventDefault();
        break;
      case "ArrowDown":
        if (index < count - 1) focusRow(index + 1);
        else event.preventDefault();
        break;
      case "Home":
        focusRow(0);
        break;
      case "End":
        focusRow(count - 1);
        break;
      case "Delete":
      case "Backspace":
        if (count > control.minItems) {
          event.preventDefault();
          remove(index);
        }
        break;
    }
  };

  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const headingId = `${baseId}-heading`;
  const selectedLabel = itemLabel(selected);

  const actionButton = (action: Action, label: string, icon: ReactNode, onClick: () => void) => (
    <button
      type="button"
      ref={(el) => {
        actions.current[action] = el;
      }}
      className={ICON_BUTTON_CLASS}
      aria-label={label}
      title={label}
      disabled={!can[action]}
      aria-controls={listId}
      onClick={onClick}
      data-action={action}
    >
      {icon}
    </button>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2" data-list={control.key}>
      <ol
        id={listId}
        aria-labelledby={props.labelId}
        aria-describedby={hintId}
        className="grid gap-1"
      >
        {items.map((it, i) => {
          const { name, preview } = title(it);
          const hidden = visibility !== undefined && it[visibility] === false;
          const label = itemLabel(i);
          const rowName = [name ? `${label}: ${name}` : label, hidden ? t("Editor.list.isHidden") : ""]
            .filter(Boolean)
            .join(", ");
          return (
            <li
              key={i}
              className={cx(
                "flex items-center gap-1 rounded-md border pr-1",
                i === selected ? "border-primary bg-accent" : "border-border",
              )}
              data-selected={i === selected || undefined}
            >
              <button
                type="button"
                ref={(el) => {
                  rows.current[i] = el;
                }}
                className={cx(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left text-sm",
                  hidden && "opacity-60",
                  FOCUS_RING,
                )}
                aria-label={rowName}
                aria-current={i === selected ? "true" : undefined}
                tabIndex={i === selected ? 0 : -1}
                onClick={() => setSelected(i)}
                onKeyDown={onRowKeyDown(i)}
              >
                <Swatch preview={preview} />
                <span className="min-w-0 flex-1" aria-hidden="true">
                  <span className="block truncate font-medium text-foreground">{label}</span>
                  {name && (
                    <span className="block truncate text-xs text-muted-foreground">{name}</span>
                  )}
                </span>
              </button>
              {visibility !== undefined && (
                <button
                  type="button"
                  className={ICON_BUTTON_CLASS}
                  aria-pressed={!hidden}
                  aria-label={t("Editor.list.visible", { item: label })}
                  title={t("Editor.list.visibleHint")}
                  onClick={() => toggleVisible(i)}
                >
                  {hidden ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div
        role="group"
        aria-label={t("Editor.list.actions", { item: selectedLabel })}
        className="flex flex-wrap items-center gap-1"
      >
        {actionButton("add", t("Editor.list.add"), <PlusIcon />, () =>
          add({ kind: "row", index: 0 }),
        )}
        {actionButton("duplicate", t("Editor.list.duplicate", { item: selectedLabel }), <CopyIcon />, () =>
          duplicate(selected),
        )}
        {actionButton("up", t("Editor.list.moveUp", { item: selectedLabel }), <ArrowUpIcon />, () =>
          move(selected, selected - 1, { kind: "action", action: "up" }),
        )}
        {actionButton("down", t("Editor.list.moveDown", { item: selectedLabel }), <ArrowDownIcon />, () =>
          move(selected, selected + 1, { kind: "action", action: "down" }),
        )}
        {actionButton("remove", t("Editor.list.remove", { item: selectedLabel }), <TrashIcon />, () =>
          remove(selected),
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t("Editor.list.count", { count, max: control.maxItems })}
        </span>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {t("Editor.list.keyboardHint")}
      </p>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        <span key={announcement.n}>{announcement.text}</span>
      </p>

      {item !== undefined && (
        <div
          role="group"
          aria-labelledby={headingId}
          className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-4 rounded-md border border-border p-3"
          data-list-form={selected}
        >
          <p id={headingId} className="text-sm font-semibold text-foreground">
            {t("Editor.list.editing", { item: selectedLabel })}
          </p>
          {props.renderForm(selected, item, headingId)}
        </div>
      )}
    </div>
  );
}
