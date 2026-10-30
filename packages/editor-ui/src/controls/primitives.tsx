"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useT } from "../i18n";
import { InfoIcon, ResetIcon } from "../shell/icons";

/** Joins class names, skipping falsy values. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Shared focus styles, matching the app's shadcn button. */
export const FOCUS_RING =
  "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export const INPUT_CLASS = cx(
  "h-8 rounded-md border border-input bg-background px-2 text-[13px] tabular-nums text-foreground transition-[color,box-shadow,border-color] placeholder:text-muted-foreground hover:border-foreground/40",
  "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
  FOCUS_RING,
);

/**
 * One bordered field holding an input plus inline buttons (shadcn/ui
 * "Input Group"): the ring follows focus anywhere inside.
 */
export const INPUT_GROUP_CLASS = cx(
  "flex h-8 w-full min-w-0 items-center rounded-md border border-input bg-background transition-[color,box-shadow,border-color] hover:border-foreground/40",
  "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50",
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
  /** Shown while the value differs from the default. */
  onReset?: () => void;
  /** Shown next to the label, e.g. the current value. */
  aside?: ReactNode;
  /**
   * Inspector row: label on the left, the control on the right, like the
   * property panels of design tools. For compact controls (slider, number,
   * select, colour, switch); wide ones (palettes, lists, tiles) stack.
   */
  inline?: boolean;
  children: ReactNode;
  controlKey: string;
}

/**
 * Help texts up to this length stay visible under the control; longer ones
 * fold behind an info button so the panel stays scannable. Screen readers
 * get the text either way through `aria-describedby`.
 */
export const INLINE_DESCRIPTION_MAX = 90;

/**
 * Pointer devices see the unlocked lock only on hover or focus of its row;
 * touch screens (no hover) always see it. A locked lock always shows.
 */
const QUIET_UNTIL_ROW_HOVER =
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 ease-out";

/** Label row with optional reset, help and lock, the control, and optional help text. */
export function ControlRow(props: ControlRowProps) {
  const t = useT();
  const [helpOpen, setHelpOpen] = useState(false);
  const folded =
    props.description !== undefined && props.description.length > INLINE_DESCRIPTION_MAX;
  const labelClass = props.inline
    ? "min-w-0 text-[13px] leading-tight text-pretty text-muted-foreground group-hover/row:text-foreground group-focus-within/row:text-foreground transition-colors"
    : "min-w-0 truncate text-[13px] font-medium text-foreground";
  const labelEl = props.labelFor ? (
    <label id={props.ids.label} htmlFor={props.ids.input} className={labelClass}>
      {props.label}
    </label>
  ) : (
    <span id={props.ids.label} className={labelClass}>
      {props.label}
    </span>
  );
  const helpButton = folded && (
    <button
      type="button"
      className={cx(ICON_BUTTON_CLASS, "size-6 [&_svg]:size-3.5")}
      aria-expanded={helpOpen}
      aria-controls={props.ids.description}
      aria-label={t("Editor.controls.showHelp", { label: props.label })}
      onClick={() => setHelpOpen((open) => !open)}
    >
      <InfoIcon />
    </button>
  );
  const actions = (
    <>
      {props.onReset && (
        <button
          type="button"
          className={cx(ICON_BUTTON_CLASS, props.inline && "size-6 [&_svg]:size-3.5")}
          aria-label={t("Editor.controls.reset", { label: props.label })}
          title={t("Editor.controls.resetShort")}
          onClick={props.onReset}
          data-reset=""
        >
          <ResetIcon />
        </button>
      )}
      {props.lock && (
        <LockButton
          label={props.label}
          locked={props.lock.locked}
          onToggle={props.lock.onToggle}
          compact={props.inline}
        />
      )}
    </>
  );
  const help = props.description !== undefined && props.ids.description && (
    <p
      id={props.ids.description}
      hidden={folded && !helpOpen}
      className={cx("text-xs text-pretty text-muted-foreground", props.inline && "col-span-2")}
    >
      {props.description}
    </p>
  );

  if (props.inline) {
    return (
      <div
        className="group/row grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-1"
        data-control={props.controlKey}
        data-inline=""
      >
        {/* Reset and lock sit at the end of the label cell, so values line up. */}
        <div className="flex min-h-8 min-w-0 items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-0.5">
            {labelEl}
            {helpButton}
          </div>
          <div className="-mr-1 flex shrink-0 items-center">{actions}</div>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          {props.children}
          {props.aside}
        </div>
        {help}
      </div>
    );
  }

  return (
    <div
      className="group/row grid grid-cols-[minmax(0,1fr)] gap-1.5"
      data-control={props.controlKey}
    >
      <div className="flex min-h-7 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-0.5">
          {labelEl}
          {helpButton}
        </div>
        <div className="flex items-center gap-1">
          {props.aside}
          {actions}
        </div>
      </div>
      {props.children}
      {help}
    </div>
  );
}

/**
 * Toggle button for "keep when shuffling". The label stays constant and
 * `aria-pressed` carries the state. Unlocked it stays quiet until its row
 * is hovered or focused; locked it shows in the accent colour.
 */
export function LockButton(props: {
  label: string;
  locked: boolean;
  onToggle(): void;
  /** Smaller hit area for inspector rows. */
  compact?: boolean | undefined;
}) {
  const t = useT();
  return (
    <button
      type="button"
      className={cx(
        ICON_BUTTON_CLASS,
        props.compact && "size-6 [&_svg]:size-3.5",
        props.locked ? "text-link aria-pressed:text-link" : QUIET_UNTIL_ROW_HOVER,
      )}
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

/** Pointer travel (px) before a press on a number field becomes a scrub. */
const SCRUB_THRESHOLD = 3;
/** Pointer travel (px) per step while scrubbing; Shift scrubs 10 steps. */
const SCRUB_PX_PER_STEP = 2;

/**
 * Number field that accepts free typing and only reports valid values.
 * Arrow keys step by `step`, Shift+Arrow by 10 steps; blur or Enter
 * normalises the text and commits. With a mouse, dragging sideways on the
 * unfocused field scrubs the value (as in design tools); a plain click
 * focuses it for typing.
 */
export function NumberInput(props: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; start: number; active: boolean } | null>(null);
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

  const onPointerDown = (event: PointerEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if (document.activeElement === input) return;
    // Hold focus back until we know whether this is a click or a scrub.
    event.preventDefault();
    scrub.current = { x: event.clientX, start: props.value, active: false };
    input.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLInputElement>) => {
    const s = scrub.current;
    if (!s) return;
    const dx = event.clientX - s.x;
    if (!s.active && Math.abs(dx) < SCRUB_THRESHOLD) return;
    s.active = true;
    const steps = Math.round(dx / SCRUB_PX_PER_STEP) * (event.shiftKey ? 10 : 1);
    const next = normalise(s.start + steps * props.step);
    setDraft(null);
    if (next !== props.value) props.onChange(next);
  };
  const onPointerUp = (event: PointerEvent<HTMLInputElement>) => {
    const s = scrub.current;
    scrub.current = null;
    if (!s) return;
    const input = event.currentTarget;
    if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId);
    if (s.active) {
      props.onCommit?.();
    } else {
      input.focus();
      input.select();
    }
  };

  return (
    <input
      id={props.id}
      type="text"
      inputMode={props.integer ? "numeric" : "decimal"}
      autoComplete="off"
      spellCheck={false}
      className={cx(
        INPUT_CLASS,
        "text-right [@media(pointer:fine)]:not-focus:cursor-ew-resize",
        props.className ?? "w-16",
      )}
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        scrub.current = null;
      }}
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
