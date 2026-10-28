"use client";

import type { AnyToolDefinition, ImageAsset } from "@musterli/tool-registry";
import { useId, useMemo, type ReactNode } from "react";
import { useT } from "../i18n";
import type { ParamValues } from "../store/editor-store";
import { applyListOp, type ListItem, type ListOp } from "../store/list";
import { useEditorStore } from "../store/react";
import { valuesEqual } from "../store/values";
import { ChevronDownIcon } from "../shell/icons";
import { BackgroundField, ColorField, PaletteField } from "./color";
import {
  NumberField,
  RangeField,
  SegmentedField,
  SelectField,
  SwitchField,
  TextField,
} from "./fields";
import { ImageField } from "./image-field";
import { ListField } from "./list-field";
import { ControlRow, cx, type ControlIds } from "./primitives";
import {
  resolveControls,
  type ControlSource,
  type OptionValue,
  type ResolvedControl,
} from "./resolve";
import { ThumbnailField, ThumbnailValue, type ThumbnailFieldValue } from "./thumbnail-field";

export interface ControlPanelProps {
  tool: AnyToolDefinition;
  params: ParamValues;
  locks: ReadonlySet<string>;
  onChange(key: string, value: unknown): void;
  /**
   * Changes a list param (add, remove, duplicate, move, set an item field).
   * Without it, the panel applies the op itself and reports the whole new
   * array through `onChange` (no lock remapping).
   */
  onListOp?(key: string, op: ListOp): boolean;
  /** Ends the current undo step (slider released, field left). */
  onCommit?(): void;
  /** Resets one param to its default (double-click on a slider). */
  onReset?(key: string): void;
  /** Without it, no lock buttons are shown. Receives the lock key (param or item field). */
  onToggleLock?(key: string): void;
  className?: string;
}

/** Callbacks of one level of controls (the tool, or the sub-form of a list item). */
interface Level {
  source: ControlSource | AnyToolDefinition;
  params: ParamValues;
  root: ParamValues;
  locks: ReadonlySet<string>;
  /** Prefix of lock keys on this level ("" for the tool, "layers.2." in a sub-form). */
  lockPrefix: string;
  /** Section titles for declared groups (the tool level) or plain blocks (sub-forms). */
  sections: boolean;
  onChange(key: string, value: unknown): void;
  onListOp(key: string, op: ListOp): boolean;
  onCommit?(): void;
  onReset?(key: string): void;
  onToggleLock?(key: string): void;
}

/**
 * Renders all controls of a tool from its schema and control hints. Purely
 * controlled: state lives in the caller (usually the editor store, see
 * `EditorControls`).
 */
export function ControlPanel(props: ControlPanelProps) {
  const { tool, params, onChange, onListOp } = props;
  const listOp = (key: string, op: ListOp): boolean => {
    if (onListOp) return onListOp(key, op);
    // Uncontrolled fallback: apply locally and report the whole array.
    const items = params[key];
    if (!Array.isArray(items)) return false;
    const groups = resolveControls(tool, params);
    const control = groups
      .flatMap((g) => [...g.controls, ...g.advanced])
      .find((c) => c.key === key);
    if (control?.kind !== "list") return false;
    const list = items as ListItem[];
    const added = op.type === "add" ? control.newItem(list) : undefined;
    const next = applyListOp(list, op, control, added);
    if (!next) return false;
    onChange(key, next);
    return true;
  };
  return (
    <div
      className={cx("grid grid-cols-[minmax(0,1fr)] gap-4", props.className)}
      data-tool={tool.id}
    >
      <ControlLevel
        source={tool}
        params={params}
        root={params}
        locks={props.locks}
        lockPrefix=""
        sections={(tool.controls?.groups?.length ?? 0) > 0}
        onChange={onChange}
        onListOp={listOp}
        {...(props.onCommit ? { onCommit: props.onCommit } : {})}
        {...(props.onReset ? { onReset: props.onReset } : {})}
        {...(props.onToggleLock ? { onToggleLock: props.onToggleLock } : {})}
      />
    </div>
  );
}

/**
 * A plain form from a schema and hints (no sections, no locks), e.g. the
 * tile editor popover (`ToolDefinition.regionEditor`). Controlled.
 */
export function ControlForm(props: {
  source: ControlSource;
  params: ParamValues;
  /** The tool params (passed to `optionPreview` as `root`). */
  root: ParamValues;
  onChange(key: string, value: unknown): void;
  onCommit?(): void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <ControlLevel
        source={props.source}
        params={props.params}
        root={props.root}
        locks={EMPTY_LOCKS}
        lockPrefix=""
        sections={false}
        onChange={props.onChange}
        onListOp={() => false}
        {...(props.onCommit ? { onCommit: props.onCommit } : {})}
      />
    </div>
  );
}

const EMPTY_LOCKS: ReadonlySet<string> = new Set();

function ControlLevel(level: Level) {
  const t = useT();
  const { source, params, root } = level;
  const groups = useMemo(() => resolveControls(source, params, root), [source, params, root]);

  const renderControls = (controls: ResolvedControl[]) =>
    controls.map((control) => (
      <ControlField key={control.key} control={control} value={params[control.key]} level={level} />
    ));

  return groups.map((group) => {
    const body = (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {renderControls(group.controls)}
        {group.advanced.length > 0 && (
          <details className="group/advanced grid grid-cols-[minmax(0,1fr)] gap-4">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md text-xs font-medium text-muted-foreground select-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              {t("Editor.controls.advanced")}
              <span className="transition-transform duration-200 ease-out group-open/advanced:rotate-180 [&_svg]:size-3.5">
                <ChevronDownIcon />
              </span>
            </summary>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-4">
              {renderControls(group.advanced)}
            </div>
          </details>
        )}
      </div>
    );
    if (!level.sections) return <div key={group.id ?? "__ungrouped"}>{body}</div>;
    const title = group.labelKey ? t(group.labelKey) : t("Editor.controls.moreSettings");
    return (
      <details
        key={group.id ?? "__ungrouped"}
        open={!group.collapsed}
        className="group/section border-b border-border pb-4 last:border-b-0"
        data-group={group.id ?? undefined}
      >
        <summary className="-mx-2 flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-foreground select-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          {title}
          <span className="text-muted-foreground transition-transform duration-200 ease-out group-open/section:rotate-180">
            <ChevronDownIcon />
          </span>
        </summary>
        <div className="mt-3">{body}</div>
      </details>
    );
  });
}

interface ControlFieldProps {
  control: ResolvedControl;
  value: unknown;
  level: Level;
}

function ControlField({ control, value, level }: ControlFieldProps) {
  const t = useT();
  const baseId = useId();
  const ids: ControlIds = { input: `${baseId}-input`, label: `${baseId}-label` };
  if (control.descriptionKey) ids.description = `${baseId}-desc`;
  const label = t(control.labelKey);
  const description = control.descriptionKey ? t(control.descriptionKey) : undefined;

  const onChange = (v: unknown) => level.onChange(control.key, v);
  const field = {
    ids,
    label,
    onChange,
    ...(level.onCommit ? { onCommit: level.onCommit } : {}),
    ...(level.onReset ? { onReset: () => level.onReset?.(control.key) } : {}),
  };

  const lockKey = `${level.lockPrefix}${control.key}`;
  const { onToggleLock } = level;
  const lock =
    control.lockable && onToggleLock
      ? { locked: level.locks.has(lockKey), onToggle: () => onToggleLock(lockKey) }
      : undefined;

  // A visible reset while the value differs from the default (double-click
  // on a slider stays as a shortcut). Lists and uploads have their own actions.
  const defaults = level.source.defaults as ParamValues;
  const resettable =
    level.onReset !== undefined &&
    control.kind !== "list" &&
    control.kind !== "image" &&
    Object.prototype.hasOwnProperty.call(defaults, control.key) &&
    !valuesEqual(value, defaults[control.key]);

  const row = (labelFor: boolean, children: ReactNode, aside?: ReactNode) => (
    <ControlRow
      controlKey={control.key}
      ids={ids}
      label={label}
      labelFor={labelFor}
      {...(description !== undefined ? { description } : {})}
      {...(lock ? { lock } : {})}
      {...(resettable ? { onReset: () => level.onReset?.(control.key) } : {})}
      aside={aside}
    >
      {children}
    </ControlRow>
  );

  switch (control.kind) {
    case "slider":
    case "angle":
      return row(true, <RangeField {...field} control={control} value={value as number} />);
    case "number":
      return row(true, <NumberField {...field} control={control} value={value as number} />);
    case "segmented":
      return row(
        false,
        <SegmentedField {...field} control={control} value={value as OptionValue} />,
      );
    case "select":
      return row(true, <SelectField {...field} control={control} value={value as OptionValue} />);
    case "thumbnails":
      return row(
        false,
        <ThumbnailField
          {...field}
          control={control}
          value={value as ThumbnailFieldValue}
          onChangeParam={level.onChange}
        />,
        <ThumbnailValue control={control} value={value} />,
      );
    case "switch":
      return row(true, null, <SwitchField {...field} control={control} value={value === true} />);
    case "text":
      return row(true, <TextField {...field} control={control} value={String(value ?? "")} />);
    case "color":
      return row(false, <ColorField {...field} control={control} value={String(value)} />);
    case "background":
      return row(false, <BackgroundField {...field} control={control} value={String(value)} />);
    case "palette":
      return row(
        false,
        <PaletteField
          {...field}
          control={control}
          value={Array.isArray(value) ? (value as string[]) : []}
        />,
      );
    case "list": {
      const items = Array.isArray(value) ? (value as ListItem[]) : [];
      const key = control.key;
      return row(
        false,
        <ListField
          control={control}
          items={items}
          root={level.root}
          labelId={ids.label}
          onListOp={(op) => level.onListOp(key, op)}
          renderForm={(index, item) => (
            <ControlLevel
              source={control.item}
              params={item}
              root={level.root}
              locks={level.locks}
              lockPrefix={`${lockKey}.${index}.`}
              sections={false}
              onChange={(field, v) => {
                level.onListOp(key, { type: "set", index, field, value: v });
              }}
              onListOp={() => false}
              {...(level.onCommit ? { onCommit: level.onCommit } : {})}
              onReset={(field) => {
                const fallback = control.item.defaults[field];
                if (fallback !== undefined) {
                  level.onListOp(key, { type: "set", index, field, value: fallback });
                }
              }}
              {...(onToggleLock ? { onToggleLock } : {})}
            />
          )}
        />,
      );
    }
    case "image":
      return row(
        false,
        <ImageField
          ids={ids}
          label={label}
          value={(value ?? null) as ImageAsset | null}
          onChange={onChange}
          output={{
            maxEdge: control.maxEdge,
            photo: control.photo,
            rasterOnly: control.rasterOnly,
            schema: control.schema,
          }}
          paste={control.paste}
          {...(level.onCommit ? { onCommit: level.onCommit } : {})}
        />,
      );
    case "shape":
      // Shapes are picked through `thumbnails` controls with `shapePreview`.
      return null;
  }
}

/** `ControlPanel` bound to the nearest `EditorStoreProvider`. */
export function EditorControls(props: { className?: string }) {
  const tool = useEditorStore((s) => s.tool);
  const params = useEditorStore((s) => s.params);
  const locks = useEditorStore((s) => s.locks);
  const setParam = useEditorStore((s) => s.setParam);
  const listOp = useEditorStore((s) => s.listOp);
  const commit = useEditorStore((s) => s.commit);
  const resetParam = useEditorStore((s) => s.resetParam);
  const toggleLock = useEditorStore((s) => s.toggleLock);
  return (
    <ControlPanel
      tool={tool}
      params={params}
      locks={locks}
      onChange={setParam}
      onListOp={listOp}
      onCommit={commit}
      onReset={resetParam}
      onToggleLock={toggleLock}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}
