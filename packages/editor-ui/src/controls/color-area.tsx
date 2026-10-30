"use client";

import { Slider } from "radix-ui";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { useT } from "../i18n";
import { hsvToHex, syncHsv, type Hsv } from "./hsv";
import { FOCUS_RING, cx } from "./primitives";

export interface ColorAreaProps {
  /** Current colour as hex. */
  value: string;
  /** Live change while dragging or using the arrow keys. */
  onChange(value: string): void;
  /** End of a gesture (pointer up, key up): closes the undo step. */
  onCommit?(): void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const percent = (v: number) => Math.round(v * 100);

/**
 * Saturation/brightness area plus a hue slider, drawn the same in every
 * browser (the native `<input type="color">` opens a different system
 * dialog on each OS). The area is one focusable slider: arrows move by 1 %,
 * Shift by 10 %; left/right is saturation, up/down brightness.
 */
export function ColorArea(props: ColorAreaProps) {
  const t = useT();
  // HSV is kept here so greys and black remember the hue they came from.
  const [hsv, setHsv] = useState<Hsv>(() => syncHsv({ h: 0, s: 0, v: 0 }, props.value));
  const shown = syncHsv(hsv, props.value);
  if (shown !== hsv) setHsv(shown);

  const apply = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    if (hex !== props.value.toLowerCase()) props.onChange(hex);
  };

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    apply({
      h: shown.h,
      s: clamp01((event.clientX - rect.left) / rect.width),
      v: 1 - clamp01((event.clientY - rect.top) / rect.height),
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    apply({ h: shown.h, s: clamp01(shown.s + move[0]), v: clamp01(shown.v + move[1]) });
  };

  const hueColor = hsvToHex({ h: shown.h, s: 1, v: 1 });

  return (
    <div className="grid gap-2.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("Editor.color.area")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent(shown.s)}
        aria-valuetext={t("Editor.color.areaValue", {
          saturation: percent(shown.s),
          brightness: percent(shown.v),
        })}
        className={cx(
          "relative h-32 w-full cursor-crosshair touch-none rounded-md shadow-[inset_0_0_0_1px_oklch(0_0_0/0.12)]",
          FOCUS_RING,
        )}
        // The area shows the colour being edited, not a UI token.
        style={{
          backgroundColor: hueColor,
          backgroundImage:
            "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
        data-testid="color-area"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
          fromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event);
        }}
        onPointerUp={() => props.onCommit?.()}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key.startsWith("Arrow")) props.onCommit?.();
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_oklch(0_0_0/0.35),0_1px_3px_oklch(0_0_0/0.3)]"
          style={{
            left: `${shown.s * 100}%`,
            top: `${(1 - shown.v) * 100}%`,
            backgroundColor: props.value,
          }}
        />
      </div>
      <Slider.Root
        className="relative flex h-4 w-full touch-none items-center select-none"
        min={0}
        max={359}
        step={1}
        value={[Math.round(shown.h)]}
        onValueChange={([h]) => {
          if (h !== undefined) apply({ ...shown, h });
        }}
        onValueCommit={() => props.onCommit?.()}
        data-testid="color-hue"
      >
        <Slider.Track
          className="relative h-3 w-full grow rounded-full shadow-[inset_0_0_0_1px_oklch(0_0_0/0.12)]"
          style={{
            background:
              "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
          }}
        />
        <Slider.Thumb
          aria-label={t("Editor.color.hue")}
          className={cx(
            "block size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_oklch(0_0_0/0.35),0_1px_3px_oklch(0_0_0/0.3)]",
            FOCUS_RING,
          )}
          style={{ backgroundColor: hueColor }}
        />
      </Slider.Root>
    </div>
  );
}
