"use client";

import {
  CANVAS_EDGE_MAX,
  CANVAS_EDGE_MIN,
  SIZE_PRESETS,
  SIZE_PRESET_GROUPS,
  type CanvasSize,
  type ToolSizePreset,
} from "@musterli/tool-registry";
import { useId, useState, type KeyboardEvent } from "react";
import { ICON_BUTTON_CLASS, INPUT_CLASS, cx } from "../controls/primitives";
import { useT } from "../i18n";
import { SwapIcon } from "./icons";

/** Option value of "no preset" (free width and height). */
export const CUSTOM_SIZE = "custom";
/** Option values of the tool's own sizes (`ToolDefinition.sizePresets`) carry this prefix. */
const TOOL_PREFIX = "tool:";

const sameSize = (a: CanvasSize, b: CanvasSize) => a.width === b.width && a.height === b.height;

export type Orientation = "portrait" | "landscape" | "square";

export function orientationOf(size: CanvasSize): Orientation {
  if (size.width === size.height) return "square";
  return size.width > size.height ? "landscape" : "portrait";
}

/**
 * Option value of the size preset with exactly this size, or `"custom"`.
 * `preferred` (the option the user picked last) wins while it still has this
 * size, since two presets can share a size (YouTube thumbnail and 4K UHD).
 * Otherwise the tool's own sizes win over common ones of the same size, and
 * other groups over social media.
 */
export function matchSizePreset(
  size: CanvasSize,
  toolPresets: readonly ToolSizePreset[] = [],
  preferred?: string,
): string {
  if (preferred !== undefined) {
    const picked = sizeOfOption(preferred, toolPresets);
    if (picked && sameSize(picked, size)) return preferred;
  }
  const own = toolPresets.find((p) => sameSize(p, size));
  if (own) return `${TOOL_PREFIX}${own.id}`;
  // A generic name (4K UHD) describes a shared size better than a platform name.
  const common =
    SIZE_PRESETS.find((p) => p.group !== "social" && sameSize(p, size)) ??
    SIZE_PRESETS.find((p) => sameSize(p, size));
  return common?.id ?? CUSTOM_SIZE;
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

/**
 * The `<option>`s of all size presets in `<optgroup>`s: the tool's own sizes
 * first ("For this tool"), then the common groups. Each reads
 * "Name (W × H, orientation)". Shared by the size picker and the export dialog.
 */
export function SizePresetOptions({
  toolPresets = [],
}: {
  toolPresets?: readonly ToolSizePreset[] | undefined;
}) {
  const t = useT();
  const label = (p: CanvasSize & { nameKey: string }) =>
    t("Editor.size.option", {
      name: t(p.nameKey),
      width: p.width,
      height: p.height,
      orientation: t(`Editor.size.orientation.${orientationOf(p)}`),
    });
  return (
    <>
      {toolPresets.length > 0 && (
        <optgroup label={t("Editor.size.groups.tool")}>
          {toolPresets.map((p) => (
            <option key={p.id} value={`${TOOL_PREFIX}${p.id}`}>
              {label(p)}
            </option>
          ))}
        </optgroup>
      )}
      {SIZE_PRESET_GROUPS.map((group) => (
        <optgroup key={group} label={t(`Editor.size.groups.${group}`)}>
          {SIZE_PRESETS.filter((p) => p.group === group).map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export interface SizePickerProps {
  size: CanvasSize;
  onChange(size: CanvasSize): void;
  /** Sizes the tool suggests, shown first ("For this tool"). */
  toolPresets?: readonly ToolSizePreset[] | undefined;
  className?: string;
}

/**
 * Size presets (the tool's own, then social media, screens, phones, tablets,
 * print and aspect ratios) plus free width and height and an orientation swap.
 */
export function SizePicker({ size, onChange, toolPresets = [], className }: SizePickerProps) {
  const t = useT();
  const id = useId();
  // The option picked last, so a size two presets share shows the chosen one.
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const selected = matchSizePreset(size, toolPresets, picked);

  return (
    <div className={cx("flex min-w-0 flex-wrap items-end gap-2", className)}>
      <div className="grid min-w-0 gap-1">
        <label htmlFor={`${id}-preset`} className="text-xs font-medium text-muted-foreground">
          {t("Editor.size.label")}
        </label>
        <select
          id={`${id}-preset`}
          className={cx(INPUT_CLASS, "w-full max-w-64 min-w-0 pr-7")}
          value={selected}
          onChange={(event) => {
            const value = event.target.value;
            const next = sizeOfOption(value, toolPresets);
            setPicked(value);
            if (next) onChange(next);
            else document.getElementById(`${id}-width`)?.focus();
          }}
        >
          <option value={CUSTOM_SIZE}>{t("Editor.size.custom")}</option>
          <SizePresetOptions toolPresets={toolPresets} />
        </select>
      </div>
      <div className="flex items-end gap-1">
        <EdgeInput
          // Remount on outside changes so the draft shows the new value.
          key={`w${size.width}`}
          id={`${id}-width`}
          label={t("Editor.size.width")}
          value={size.width}
          onCommit={(width) => onChange({ width, height: size.height })}
        />
        <button
          type="button"
          className={cx(ICON_BUTTON_CLASS, "mb-0.5")}
          aria-label={t("Editor.size.swap")}
          title={t("Editor.size.swap")}
          disabled={size.width === size.height}
          onClick={() => onChange({ width: size.height, height: size.width })}
        >
          <SwapIcon />
        </button>
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
