"use client";

import type { AnyToolDefinition } from "@motivo/tool-registry";
import { useId, useMemo, type ReactNode } from "react";
import { useT } from "../i18n";
import type { ParamValues } from "../store/editor-store";
import { useEditorStore } from "../store/react";
import { BackgroundField, ColorField, PaletteField } from "./color";
import {
  NumberField,
  RangeField,
  SegmentedField,
  SelectField,
  SwitchField,
  TextField,
} from "./fields";
import { ControlRow, cx, type ControlIds } from "./primitives";
import { resolveControls, type OptionValue, type ResolvedControl } from "./resolve";

export interface ControlPanelProps {
  tool: AnyToolDefinition;
  params: ParamValues;
  locks: ReadonlySet<string>;
  onChange(key: string, value: unknown): void;
  /** Ends the current undo step (slider released, field left). */
  onCommit?(): void;
  /** Resets one param to its default (double-click on a slider). */
  onReset?(key: string): void;
  /** Without it, no lock buttons are shown. */
  onToggleLock?(key: string): void;
  className?: string;
}

/**
 * Renders all controls of a tool from its schema and control hints. Purely
 * controlled: state lives in the caller (usually the editor store, see
 * `EditorControls`).
 */
export function ControlPanel(props: ControlPanelProps) {
  const t = useT();
  const { tool, params } = props;
  const groups = useMemo(() => resolveControls(tool, params), [tool, params]);
  const declared = (tool.controls?.groups?.length ?? 0) > 0;

  const renderControls = (controls: ResolvedControl[]) =>
    controls.map((control) => (
      <ControlField key={control.key} control={control} value={params[control.key]} {...props} />
    ));

  return (
    <div
      className={cx("grid grid-cols-[minmax(0,1fr)] gap-4", props.className)}
      data-tool={tool.id}
    >
      {groups.map((group) => {
        const body = (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            {renderControls(group.controls)}
            {group.advanced.length > 0 && (
              <details className="group/advanced grid grid-cols-[minmax(0,1fr)] gap-4">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                  {t("Editor.controls.advanced")}
                </summary>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-4">
                  {renderControls(group.advanced)}
                </div>
              </details>
            )}
          </div>
        );
        if (!declared) return <div key="all">{body}</div>;
        const title = group.labelKey ? t(group.labelKey) : t("Editor.controls.moreSettings");
        return (
          <details
            key={group.id ?? "__ungrouped"}
            open={!group.collapsed}
            className="border-b border-border pb-4 last:border-b-0"
            data-group={group.id ?? undefined}
          >
            <summary className="cursor-pointer py-1 text-sm font-semibold text-foreground select-none">
              {title}
            </summary>
            <div className="mt-3">{body}</div>
          </details>
        );
      })}
    </div>
  );
}

interface ControlFieldProps extends ControlPanelProps {
  control: ResolvedControl;
  value: unknown;
}

function ControlField({ control, value, ...props }: ControlFieldProps) {
  const t = useT();
  const baseId = useId();
  const ids: ControlIds = { input: `${baseId}-input`, label: `${baseId}-label` };
  if (control.descriptionKey) ids.description = `${baseId}-desc`;
  const label = t(control.labelKey);
  const description = control.descriptionKey ? t(control.descriptionKey) : undefined;

  const onChange = (v: unknown) => props.onChange(control.key, v);
  const field = {
    ids,
    label,
    onChange,
    ...(props.onCommit ? { onCommit: props.onCommit } : {}),
    ...(props.onReset ? { onReset: () => props.onReset?.(control.key) } : {}),
  };

  const { onToggleLock } = props;
  const lock =
    control.lockable && onToggleLock
      ? { locked: props.locks.has(control.key), onToggle: () => onToggleLock(control.key) }
      : undefined;

  const row = (labelFor: boolean, children: ReactNode, aside?: ReactNode) => (
    <ControlRow
      controlKey={control.key}
      ids={ids}
      label={label}
      labelFor={labelFor}
      {...(description !== undefined ? { description } : {})}
      {...(lock ? { lock } : {})}
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
    case "shape":
    case "image":
      // Pickers for shapes and image upload arrive with the tools that need them.
      return null;
  }
}

/** `ControlPanel` bound to the nearest `EditorStoreProvider`. */
export function EditorControls(props: { className?: string }) {
  const tool = useEditorStore((s) => s.tool);
  const params = useEditorStore((s) => s.params);
  const locks = useEditorStore((s) => s.locks);
  const setParam = useEditorStore((s) => s.setParam);
  const commit = useEditorStore((s) => s.commit);
  const resetParam = useEditorStore((s) => s.resetParam);
  const toggleLock = useEditorStore((s) => s.toggleLock);
  return (
    <ControlPanel
      tool={tool}
      params={params}
      locks={locks}
      onChange={setParam}
      onCommit={commit}
      onReset={resetParam}
      onToggleLock={toggleLock}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}
