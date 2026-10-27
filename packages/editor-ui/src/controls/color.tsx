"use client";

import { HEX_COLOR_PATTERN, TRANSPARENT } from "@motivo/tool-registry";
import { Popover, Switch } from "radix-ui";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useT } from "../i18n";
import type { FieldProps } from "./fields";
import { FOCUS_RING, ICON_BUTTON_CLASS, INPUT_CLASS, cx } from "./primitives";
import type { PaletteControl, ResolvedControl } from "./resolve";

/** `#abc` -> `#aabbcc`, lower case. Assumes a valid hex colour. */
export function toLongHex(hex: string): string {
  const h = hex.toLowerCase();
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
}

interface EyeDropperResult {
  sRGBHex: string;
}
type EyeDropperCtor = new () => { open(): Promise<EyeDropperResult> };

const noopSubscribe = () => () => undefined;

/** EyeDropper API (Chromium only); false during SSR so markup matches. */
function useEyeDropper(): EyeDropperCtor | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => (window as { EyeDropper?: EyeDropperCtor }).EyeDropper ?? null,
    () => null,
  );
}

export interface ColorPickerProps {
  value: string;
  onChange(value: string): void;
  onCommit?(): void;
  /** Accessible name of the trigger. Use either this or `labelledBy`. */
  ariaLabel?: string;
  labelledBy?: string;
  describedBy?: string;
  id?: string;
  /** Show the hex value next to the swatch. */
  showValue?: boolean;
  /** Extra actions at the bottom of the popover (palette: move, remove). */
  actions?: ReactNode;
}

/**
 * Swatch button that opens a popover with the native colour input, a hex
 * field and, where available, the EyeDropper. Changes apply live.
 */
export function ColorPicker(props: ColorPickerProps) {
  const t = useT();
  const hexId = useId();
  const errorId = useId();
  const valueId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const EyeDropper = useEyeDropper();
  const invalid = draft !== null && !HEX_COLOR_PATTERN.test(draft.trim());

  const commitDraft = () => {
    if (draft !== null && HEX_COLOR_PATTERN.test(draft.trim())) {
      const next = draft.trim().toLowerCase();
      if (next !== props.value) props.onChange(next);
    }
    setDraft(null);
    props.onCommit?.();
  };

  const labelledBy = props.labelledBy
    ? props.showValue
      ? `${props.labelledBy} ${valueId}`
      : props.labelledBy
    : undefined;

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) {
          setDraft(null);
          props.onCommit?.();
        }
      }}
    >
      <Popover.Trigger
        id={props.id}
        className={cx(
          "inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-1.5 text-sm",
          "hover:bg-accent",
          FOCUS_RING,
        )}
        aria-label={props.ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={props.describedBy}
      >
        <span
          className="size-5 rounded-sm border border-border"
          // The swatch shows user content, not a UI token.
          style={{ backgroundColor: props.value }}
          aria-hidden="true"
        />
        {props.showValue && (
          <span id={valueId} className="pr-1 font-mono text-xs text-muted-foreground">
            {props.value}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="start"
          className="z-50 grid w-56 gap-3 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
        >
          <input
            type="color"
            aria-label={t("Editor.color.picker")}
            className={cx("h-24 w-full cursor-pointer rounded-md border border-input", FOCUS_RING)}
            value={toLongHex(props.value)}
            onChange={(event) => {
              setDraft(null);
              props.onChange(event.target.value.toLowerCase());
            }}
          />
          <div className="grid gap-1">
            <label htmlFor={hexId} className="text-xs text-muted-foreground">
              {t("Editor.color.hex")}
            </label>
            <div className="flex items-center gap-1">
              <input
                id={hexId}
                type="text"
                spellCheck={false}
                autoComplete="off"
                maxLength={7}
                className={cx(INPUT_CLASS, "w-full font-mono")}
                value={draft ?? props.value}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                onChange={(event) => {
                  const text = event.target.value;
                  setDraft(text);
                  if (HEX_COLOR_PATTERN.test(text.trim())) {
                    const next = text.trim().toLowerCase();
                    if (next !== props.value) props.onChange(next);
                  }
                }}
                onBlur={commitDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitDraft();
                }}
              />
              {EyeDropper && (
                <button
                  type="button"
                  className={ICON_BUTTON_CLASS}
                  aria-label={t("Editor.color.eyedropper")}
                  title={t("Editor.color.eyedropper")}
                  onClick={() => {
                    new EyeDropper()
                      .open()
                      .then((result) => {
                        props.onChange(toLongHex(result.sRGBHex));
                        props.onCommit?.();
                      })
                      // Cancelled by the user (Escape): nothing to do.
                      .catch(() => undefined);
                  }}
                >
                  <EyeDropperIcon />
                </button>
              )}
            </div>
            {invalid && (
              <p id={errorId} className="text-xs text-destructive" role="alert">
                {t("Editor.color.invalid")}
              </p>
            )}
          </div>
          {props.actions}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ColorField(props: FieldProps<ResolvedControl, string>) {
  return (
    <ColorPicker
      id={props.ids.input}
      value={props.value}
      showValue
      labelledBy={props.ids.label}
      onChange={props.onChange}
      {...(props.onCommit ? { onCommit: props.onCommit } : {})}
      {...(props.ids.description ? { describedBy: props.ids.description } : {})}
    />
  );
}

/** Solid colour or transparent. Remembers the last colour for switching back. */
export function BackgroundField(props: FieldProps<ResolvedControl, string>) {
  const t = useT();
  const switchId = useId();
  const transparent = props.value === TRANSPARENT;
  const [lastColor, setLastColor] = useState(transparent ? "#ffffff" : props.value);

  return (
    <div className="flex items-center gap-3">
      {!transparent && (
        <ColorPicker
          id={props.ids.input}
          value={props.value}
          showValue
          labelledBy={props.ids.label}
          onChange={(color) => {
            setLastColor(color);
            props.onChange(color);
          }}
          {...(props.onCommit ? { onCommit: props.onCommit } : {})}
          {...(props.ids.description ? { describedBy: props.ids.description } : {})}
        />
      )}
      <span className="flex items-center gap-2">
        <Switch.Root
          id={switchId}
          checked={transparent}
          onCheckedChange={(checked) => {
            if (checked) {
              setLastColor(props.value);
              props.onChange(TRANSPARENT);
            } else {
              props.onChange(lastColor);
            }
            props.onCommit?.();
          }}
          className={cx(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent",
            "bg-input transition-colors data-[state=checked]:bg-primary",
            FOCUS_RING,
          )}
        >
          <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-4" />
        </Switch.Root>
        <label htmlFor={switchId} className="text-sm text-foreground">
          {t("Editor.background.transparent")}
        </label>
      </span>
    </div>
  );
}

/** Row of swatches; each opens a picker with move and remove actions. */
export function PaletteField(props: FieldProps<PaletteControl, readonly string[]>) {
  const t = useT();
  const { minItems, maxItems } = props.control;
  const colors = props.value;

  const replace = (next: string[]) => {
    props.onChange(next);
  };
  const move = (from: number, to: number) => {
    const next = [...colors];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    replace(next);
    props.onCommit?.();
  };

  return (
    <ul
      className="flex flex-wrap items-center gap-1.5"
      aria-labelledby={props.ids.label}
      aria-describedby={props.ids.description}
    >
      {colors.map((color, i) => (
        // Index keys: swatches are positional and may repeat colours.
        <li key={i}>
          <ColorPicker
            value={color}
            ariaLabel={t("Editor.palette.swatch", {
              index: i + 1,
              count: colors.length,
              value: color,
            })}
            onChange={(c) => replace(colors.map((old, j) => (j === i ? c : old)))}
            {...(props.onCommit ? { onCommit: props.onCommit } : {})}
            actions={
              <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
                <span className="flex gap-1">
                  <button
                    type="button"
                    className={ICON_BUTTON_CLASS}
                    aria-label={t("Editor.palette.moveLeft")}
                    title={t("Editor.palette.moveLeft")}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ChevronIcon dir="left" />
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON_CLASS}
                    aria-label={t("Editor.palette.moveRight")}
                    title={t("Editor.palette.moveRight")}
                    disabled={i === colors.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ChevronIcon dir="right" />
                  </button>
                </span>
                <button
                  type="button"
                  className={cx(ICON_BUTTON_CLASS, "w-auto px-2 text-xs")}
                  disabled={colors.length <= minItems}
                  onClick={() => {
                    replace(colors.filter((_, j) => j !== i));
                    props.onCommit?.();
                  }}
                >
                  {t("Editor.palette.remove")}
                </button>
              </div>
            }
          />
        </li>
      ))}
      {colors.length < maxItems && (
        <li>
          <button
            type="button"
            className={cx(ICON_BUTTON_CLASS, "size-8 border border-dashed border-input")}
            aria-label={t("Editor.palette.add")}
            title={t("Editor.palette.add")}
            onClick={() => {
              replace([...colors, colors.at(-1) ?? "#000000"]);
              props.onCommit?.();
            }}
          >
            <PlusIcon />
          </button>
        </li>
      )}
    </ul>
  );
}

function svgProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
}

function PlusIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg {...svgProps()}>
      <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function EyeDropperIcon() {
  return (
    <svg {...svgProps()}>
      <path d="m2 22 1-1h3l9-9M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
    </svg>
  );
}
