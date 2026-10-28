"use client";

import {
  CANVAS_EDGE_MAX,
  CANVAS_EDGE_MIN,
  SIZE_PRESETS,
  type CanvasSize,
  type SizePresetGroup,
  type ToolSizePreset,
} from "@musterli/tool-registry";
import { useId, useState, type KeyboardEvent } from "react";
import { INPUT_CLASS, cx } from "../controls/primitives";
import { useT } from "../i18n";

const GROUPS: readonly SizePresetGroup[] = ["social", "desktop", "mobile", "print"];
const CUSTOM = "custom";
/** Option values of the tool's own sizes (`ToolDefinition.sizePresets`) carry this prefix. */
const TOOL_PREFIX = "tool:";

const sameSize = (a: CanvasSize, b: CanvasSize) => a.width === b.width && a.height === b.height;

/**
 * Option value of the size preset with exactly this size, or `"custom"`.
 * The tool's own sizes win over common ones of the same size.
 */
export function matchSizePreset(
  size: CanvasSize,
  toolPresets: readonly ToolSizePreset[] = [],
): string {
  const own = toolPresets.find((p) => sameSize(p, size));
  if (own) return `${TOOL_PREFIX}${own.id}`;
  return SIZE_PRESETS.find((p) => sameSize(p, size))?.id ?? CUSTOM;
}

/** The size behind an option value of the picker, `undefined` for "custom". */
export function sizeOfOption(
  value: string,
  toolPresets: readonly ToolSizePreset[] = [],
): CanvasSize | undefined {
  const preset = value.startsWith(TOOL_PREFIX)
    ? toolPresets.find((p) => `${TOOL_PREFIX}${p.id}` === value)
    : SIZE_PRESETS.find((p) => p.id === value);
  return preset ? { width: preset.width, height: preset.height } : undefined;
}

/** Parses an edge length; `null` unless it is an integer within the canvas limits. */
export function parseEdge(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= CANVAS_EDGE_MIN && n <= CANVAS_EDGE_MAX ? n : null;
}

export interface SizePickerProps {
  size: CanvasSize;
  onChange(size: CanvasSize): void;
  /** Sizes the tool suggests, shown first ("For this tool"). */
  toolPresets?: readonly ToolSizePreset[] | undefined;
  className?: string;
}

/** Size presets (the tool's own, Social, Desktop, Mobile, Print) plus free width and height. */
export function SizePicker({ size, onChange, toolPresets = [], className }: SizePickerProps) {
  const t = useT();
  const id = useId();
  const selected = matchSizePreset(size, toolPresets);

  return (
    <div className={cx("flex flex-wrap items-end gap-2", className)}>
      <div className="grid gap-1">
        <label htmlFor={`${id}-preset`} className="text-xs font-medium text-muted-foreground">
          {t("Editor.size.label")}
        </label>
        <select
          id={`${id}-preset`}
          className={cx(INPUT_CLASS, "max-w-56 pr-7")}
          value={selected}
          onChange={(event) => {
            const next = sizeOfOption(event.target.value, toolPresets);
            if (next) onChange(next);
            else document.getElementById(`${id}-width`)?.focus();
          }}
        >
          <option value={CUSTOM}>{t("Editor.size.custom")}</option>
          {toolPresets.length > 0 && (
            <optgroup label={t("Editor.size.groups.tool")}>
              {toolPresets.map((p) => (
                <option key={p.id} value={`${TOOL_PREFIX}${p.id}`}>
                  {t("Editor.size.option", {
                    name: t(p.nameKey),
                    width: p.width,
                    height: p.height,
                  })}
                </option>
              ))}
            </optgroup>
          )}
          {GROUPS.map((group) => (
            <optgroup key={group} label={t(`Editor.size.groups.${group}`)}>
              {SIZE_PRESETS.filter((p) => p.group === group).map((p) => (
                <option key={p.id} value={p.id}>
                  {t("Editor.size.option", {
                    name: t(p.nameKey),
                    width: p.width,
                    height: p.height,
                  })}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-2">
        <EdgeInput
          // Remount on outside changes so the draft shows the new value.
          key={`w${size.width}`}
          id={`${id}-width`}
          label={t("Editor.size.width")}
          value={size.width}
          onCommit={(width) => onChange({ width, height: size.height })}
        />
        <span aria-hidden="true" className="pb-1.5 text-sm text-muted-foreground">
          ×
        </span>
        <EdgeInput
          key={`h${size.height}`}
          id={`${id}-height`}
          label={t("Editor.size.height")}
          value={size.height}
          onCommit={(height) => onChange({ width: size.width, height })}
        />
      </div>
    </div>
  );
}

function EdgeInput(props: {
  id: string;
  label: string;
  value: number;
  onCommit(value: number): void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(String(props.value));
  const parsed = parseEdge(draft);
  const invalid = parsed === null;
  const errorId = `${props.id}-error`;

  const commit = () => {
    if (parsed !== null && parsed !== props.value) props.onCommit(parsed);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setDraft(String(props.value));
  };

  return (
    <div className="relative grid gap-1">
      <label htmlFor={props.id} className="text-xs font-medium text-muted-foreground">
        {props.label}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={props.id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          className={cx(INPUT_CLASS, "w-20 text-right")}
          value={draft}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <span className="text-xs text-muted-foreground">px</span>
      </div>
      {invalid && (
        <p
          id={errorId}
          role="alert"
          className="absolute top-full left-0 mt-1 w-48 text-xs text-destructive"
        >
          {t("Editor.size.invalid", { min: CANVAS_EDGE_MIN, max: CANVAS_EDGE_MAX })}
        </p>
      )}
    </div>
  );
}
