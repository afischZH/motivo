"use client";

/**
 * Small labelled form fields of the social editor's side panel. Native
 * inputs (keyboard and screen readers work as everywhere), every field with
 * a visible label.
 */
import { isColorSlot, resolveColor, type ColorRef } from "@musterli/scene";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export const INPUT =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50";
export const LABEL = "text-xs font-medium text-muted-foreground";

export function Field(props: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", props.className)}>
      <label htmlFor={props.htmlFor} className={LABEL}>
        {props.label}
      </label>
      {props.children}
    </div>
  );
}

/**
 * A number that is applied on every valid keystroke and clamped on blur.
 * `onCommit` ends the undo step (field left).
 */
export function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Shown value precision. */
  digits?: number;
  disabled?: boolean;
  testId?: string;
  onChange(value: number): void;
  onCommit?(): void;
}) {
  const id = useId();
  const digits = props.digits ?? 0;
  const shown = Number(props.value.toFixed(digits));
  const [text, setText] = useState(String(shown));
  const [editing, setEditing] = useState(false);
  // Follows the value from outside (undo, drag) while the field is not being typed in.
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    if (!editing) setText(String(shown));
  }
  return (
    <Field label={props.label} htmlFor={id}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className={INPUT}
        value={text}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        disabled={props.disabled}
        data-testid={props.testId}
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          setText(event.currentTarget.value);
          const value = Number(event.currentTarget.value);
          if (event.currentTarget.value !== "" && Number.isFinite(value)) {
            props.onChange(Math.min(props.max, Math.max(props.min, value)));
          }
        }}
        onBlur={() => {
          setEditing(false);
          setText(String(shown));
          props.onCommit?.();
        }}
      />
    </Field>
  );
}

export function SelectField<V extends string>(props: {
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  disabled?: boolean;
  testId?: string;
  className?: string;
  onChange(value: V): void;
}) {
  const id = useId();
  return (
    <Field
      label={props.label}
      htmlFor={id}
      {...(props.className ? { className: props.className } : {})}
    >
      <select
        id={id}
        className={INPUT}
        value={props.value}
        disabled={props.disabled}
        data-testid={props.testId}
        onChange={(event) => props.onChange(event.currentTarget.value as V)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  testId?: string;
  onChange(checked: boolean): void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        className="size-4 accent-primary"
        checked={props.checked}
        disabled={props.disabled}
        data-testid={props.testId}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <label htmlFor={id} className="text-sm">
        {props.label}
      </label>
    </div>
  );
}

/**
 * A scene colour: one of the scene palette's slots (they follow the brand
 * palette) or a fixed colour. Swatches are a radio group, the custom colour
 * a native colour input.
 */
export function ColorRefField(props: {
  label: string;
  value: ColorRef | null;
  palette: readonly string[];
  /** Offer "none" (transparent fill, no outline). */
  allowNone?: boolean;
  testId?: string;
  onChange(value: ColorRef | null): void;
}) {
  const t = useTranslations("SocialEditor.color");
  const id = useId();
  const customId = `${id}-custom`;
  const current = props.value === null ? null : resolveColor(props.value, props.palette);
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" data-testid={props.testId}>
      <legend className={cn(LABEL, "mb-1")}>{props.label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {props.allowNone && (
          <Swatch
            label={t("none")}
            selected={props.value === null}
            onSelect={() => props.onChange(null)}
          >
            <span className="block size-full rounded-full bg-[linear-gradient(135deg,transparent_45%,var(--destructive)_45%,var(--destructive)_55%,transparent_55%)]" />
          </Swatch>
        )}
        {props.palette.map((color, i) => {
          const slot = `brand-${i + 1}`;
          return (
            <Swatch
              key={slot}
              label={t("slot", { n: i + 1, color })}
              selected={props.value === slot}
              onSelect={() => props.onChange(slot)}
            >
              <span className="block size-full rounded-full" style={{ background: color }} />
            </Swatch>
          );
        })}
        <label htmlFor={customId} className="sr-only">
          {t("custom")}
        </label>
        <input
          id={customId}
          type="color"
          title={t("custom")}
          className={cn(
            "h-7 w-9 cursor-pointer rounded-md border border-input bg-background p-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            props.value !== null && !isColorSlot(props.value) && "ring-2 ring-ring",
          )}
          value={current ?? "#000000"}
          onChange={(event) => props.onChange(event.currentTarget.value.toLowerCase())}
        />
      </div>
    </fieldset>
  );
}

function Swatch(props: {
  label: string;
  selected: boolean;
  onSelect(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.selected}
      title={props.label}
      onClick={props.onSelect}
      className={cn(
        "size-7 rounded-full border border-border p-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        props.selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
    >
      {props.children}
    </button>
  );
}
