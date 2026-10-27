"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "../i18n";

/** Joins class names, skipping falsy values. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Shared focus styles, matching the app's shadcn button. */
export const FOCUS_RING =
  "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export const INPUT_CLASS = cx(
  "h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums text-foreground",
  "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
  FOCUS_RING,
);

export const ICON_BUTTON_CLASS = cx(
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground",
  "hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40",
  "aria-pressed:text-foreground [&_svg]:size-4",
  FOCUS_RING,
);

/** Ids a control needs to wire its label and help text. */
export interface ControlIds {
  /** Id of the focusable input, for `<label htmlFor>`. */
  input: string;
  /** Id of the visible label element. */
  label: string;
  /** Id of the help text, if any. */
  description?: string;
}

export interface ControlRowProps {
  ids: ControlIds;
  label: string;
  description?: string;
  /** Render the label as `<label htmlFor>` (single inputs) or a plain element (groups). */
  labelFor: boolean;
  lock?: { locked: boolean; onToggle(): void };
  /** Shown next to the label, e.g. the current value. */
  aside?: ReactNode;
  children: ReactNode;
  controlKey: string;
}

/** Label row with optional lock, the control, and optional help text. */
export function ControlRow(props: ControlRowProps) {
  const labelClass = "min-w-0 truncate text-sm font-medium text-foreground";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5" data-control={props.controlKey}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        {props.labelFor ? (
          <label id={props.ids.label} htmlFor={props.ids.input} className={labelClass}>
            {props.label}
          </label>
        ) : (
          <span id={props.ids.label} className={labelClass}>
            {props.label}
          </span>
        )}
        <div className="flex items-center gap-1">
          {props.aside}
          {props.lock && (
            <LockButton
              label={props.label}
              locked={props.lock.locked}
              onToggle={props.lock.onToggle}
            />
          )}
        </div>
      </div>
      {props.children}
      {props.description !== undefined && props.ids.description && (
        <p id={props.ids.description} className="text-xs text-muted-foreground">
          {props.description}
        </p>
      )}
    </div>
  );
}

/**
 * Toggle button for "keep when shuffling". The label stays constant and
 * `aria-pressed` carries the state.
 */
export function LockButton(props: { label: string; locked: boolean; onToggle(): void }) {
  const t = useT();
  return (
    <button
      type="button"
      className={ICON_BUTTON_CLASS}
      aria-pressed={props.locked}
      aria-label={t("Editor.controls.lock", { label: props.label })}
      title={t("Editor.controls.lockHint")}
      onClick={props.onToggle}
      data-locked={props.locked || undefined}
    >
      {props.locked ? <LockClosedIcon /> : <LockOpenIcon />}
    </button>
  );
}

/** Number of decimals needed to show values on a step grid (max 4). */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  for (let d = 0; d < 4; d++) {
    const scaled = step * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return d;
  }
  return 4;
}

export function clampNumber(value: number, min?: number, max?: number): number {
  let v = value;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

export interface NumberInputProps {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step: number;
  integer: boolean;
  /** Accessible name when not labelled by a `<label htmlFor>`. */
  ariaLabel?: string;
  describedBy?: string;
  className?: string;
  onChange(value: number): void;
  onCommit?(): void;
}

/**
 * Number field that accepts free typing and only reports valid values.
 * Arrow keys step by `step`, Shift+Arrow by 10 steps; blur or Enter
 * normalises the text and commits.
 */
export function NumberInput(props: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Up to 4 decimals hides float noise (0.30000000000000004) without hiding typed values.
  const decimals = props.integer ? 0 : Math.max(stepDecimals(props.step), 4);
  const shown = draft ?? String(Number(props.value.toFixed(decimals)));

  const normalise = (n: number): number => {
    const v = clampNumber(n, props.min, props.max);
    return props.integer ? Math.round(v) : Number(v.toFixed(decimals));
  };

  const finish = () => {
    setDraft(null);
    props.onCommit?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      finish();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const dir = event.key === "ArrowUp" ? 1 : -1;
    const delta = dir * props.step * (event.shiftKey ? 10 : 1);
    setDraft(null);
    const next = normalise(props.value + delta);
    if (next !== props.value) props.onChange(next);
  };

  return (
    <input
      id={props.id}
      type="text"
      inputMode={props.integer ? "numeric" : "decimal"}
      autoComplete="off"
      spellCheck={false}
      className={cx(INPUT_CLASS, "w-16 text-right", props.className)}
      value={shown}
      aria-label={props.ariaLabel}
      aria-describedby={props.describedBy}
      aria-invalid={draft !== null && !Number.isFinite(parseLocaleNumber(draft)) ? true : undefined}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const n = parseLocaleNumber(text);
        if (!Number.isFinite(n)) return;
        // Out-of-range or off-grid input stays a draft until blur normalises it.
        if (normalise(n) === n && n !== props.value) props.onChange(n);
      }}
      onBlur={() => {
        if (draft !== null) {
          const n = parseLocaleNumber(draft);
          if (Number.isFinite(n)) {
            const next = normalise(n);
            if (next !== props.value) props.onChange(next);
          }
        }
        finish();
      }}
      onKeyDown={onKeyDown}
    />
  );
}

/** Parses "1.5" and "1,5" (Swiss/German keyboards). Empty input is NaN. */
export function parseLocaleNumber(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "" || trimmed === "-" || trimmed === ".") return Number.NaN;
  return Number(trimmed);
}

function LockClosedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.75-1.4" />
    </svg>
  );
}
