"use client";

import { Slider, Switch, ToggleGroup } from "radix-ui";
import type {
  ChoiceControl,
  NumberControl,
  OptionValue,
  RangeControl,
  TextControl,
} from "./resolve";
import { FOCUS_RING, INPUT_CLASS, NumberInput, cx, type ControlIds } from "./primitives";
import { useT } from "../i18n";

/** Props every field input receives from the panel. */
export interface FieldProps<C, V> {
  control: C;
  value: V;
  ids: ControlIds;
  label: string;
  onChange(value: V): void;
  /** Ends the current undo step (pointer up, blur). */
  onCommit?(): void;
  /** Back to the tool default (double-click). */
  onReset?(): void;
}

/** Slider plus number field (docs/DESIGN.md: Shift = 10 steps, double-click = default). */
export function RangeField(props: FieldProps<RangeControl, number>) {
  const t = useT();
  const { control: c } = props;
  return (
    <div className="flex items-center gap-3">
      <Slider.Root
        className="relative flex h-5 flex-1 touch-none items-center select-none data-disabled:opacity-50"
        min={c.min}
        max={c.max}
        step={c.step}
        value={[props.value]}
        onValueChange={([v]) => {
          if (v !== undefined && v !== props.value) props.onChange(v);
        }}
        onValueCommit={() => props.onCommit?.()}
        onDoubleClick={props.onReset}
        title={props.onReset ? t("Editor.controls.resetHint") : undefined}
      >
        <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted">
          <Slider.Range className="absolute h-full bg-primary" />
        </Slider.Track>
        <Slider.Thumb
          className={cx(
            "block size-4 rounded-full border-2 border-primary bg-background shadow-sm",
            FOCUS_RING,
          )}
          aria-labelledby={props.ids.label}
          aria-describedby={props.ids.description}
          aria-valuetext={c.unit ? `${props.value}${c.unit}` : undefined}
        />
      </Slider.Root>
      {/* One width for every slider's field, the unit sits inside it. */}
      <span className="relative shrink-0">
        <NumberInput
          id={props.ids.input}
          value={props.value}
          min={c.min}
          max={c.max}
          step={c.step}
          integer={c.integer}
          className={cx("w-[4.5rem]", c.unit && "pr-6")}
          onChange={props.onChange}
          {...(props.onCommit ? { onCommit: props.onCommit } : {})}
          {...(props.ids.description ? { describedBy: props.ids.description } : {})}
        />
        {c.unit && (
          <span
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            {c.unit}
          </span>
        )}
      </span>
    </div>
  );
}

export function NumberField(props: FieldProps<NumberControl, number>) {
  const { control: c } = props;
  return (
    <span className="flex items-center gap-1">
      <NumberInput
        id={props.ids.input}
        value={props.value}
        step={c.step}
        integer={c.integer}
        className="w-24"
        onChange={props.onChange}
        {...(c.min !== undefined ? { min: c.min } : {})}
        {...(c.max !== undefined ? { max: c.max } : {})}
        {...(props.onCommit ? { onCommit: props.onCommit } : {})}
        {...(props.ids.description ? { describedBy: props.ids.description } : {})}
      />
      {c.unit && (
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {c.unit}
        </span>
      )}
    </span>
  );
}

function optionByKey(options: ChoiceControl["options"], key: string): OptionValue | undefined {
  return options.find((o) => String(o.value) === key)?.value;
}

/** Segmented control for small enums: one tab stop, arrow keys move between options. */
export function SegmentedField(props: FieldProps<ChoiceControl, OptionValue>) {
  const t = useT();
  return (
    <ToggleGroup.Root
      type="single"
      id={props.ids.input}
      className="flex w-full rounded-md bg-muted p-0.5"
      value={String(props.value)}
      onValueChange={(key) => {
        // Radix allows deselecting; an enum always has a value.
        const value = optionByKey(props.control.options, key);
        if (value !== undefined && value !== props.value) props.onChange(value);
      }}
      aria-labelledby={props.ids.label}
      aria-describedby={props.ids.description}
    >
      {props.control.options.map((option) => (
        <ToggleGroup.Item
          key={String(option.value)}
          value={String(option.value)}
          className={cx(
            // Long labels wrap onto a second line instead of being cut off.
            "min-h-7 min-w-0 flex-1 rounded-[calc(var(--radius-md)-2px)] px-2 py-1 text-xs leading-tight font-medium text-balance break-words",
            "text-muted-foreground hover:text-foreground",
            "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
            FOCUS_RING,
          )}
        >
          {t(option.labelKey)}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/** Native select for larger enums: best keyboard, screen reader and mobile support. */
export function SelectField(props: FieldProps<ChoiceControl, OptionValue>) {
  const t = useT();
  return (
    <select
      id={props.ids.input}
      className={cx(INPUT_CLASS, "w-full")}
      value={String(props.value)}
      aria-describedby={props.ids.description}
      onChange={(event) => {
        const value = optionByKey(props.control.options, event.target.value);
        if (value !== undefined) props.onChange(value);
      }}
    >
      {props.control.options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {t(option.labelKey)}
        </option>
      ))}
    </select>
  );
}

export function SwitchField(props: FieldProps<unknown, boolean>) {
  return (
    <Switch.Root
      id={props.ids.input}
      checked={props.value}
      onCheckedChange={(checked) => props.onChange(checked)}
      aria-describedby={props.ids.description}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent",
        "bg-input transition-colors data-[state=checked]:bg-primary",
        FOCUS_RING,
      )}
    >
      <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-4" />
    </Switch.Root>
  );
}

export function TextField(props: FieldProps<TextControl, string>) {
  return (
    <input
      id={props.ids.input}
      type="text"
      className={cx(INPUT_CLASS, "w-full")}
      value={props.value}
      maxLength={props.control.maxLength}
      aria-describedby={props.ids.description}
      onChange={(event) => props.onChange(event.target.value)}
      onBlur={() => props.onCommit?.()}
    />
  );
}
