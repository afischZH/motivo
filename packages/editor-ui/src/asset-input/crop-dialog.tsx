"use client";

/**
 * Crop dialog for uploads (docs/DESIGN.md 3, "Crop-Dialog"). A native modal
 * `<dialog>` (focus stays inside, Escape cancels) with the picture, a crop
 * frame that moves and resizes by pointer or keyboard, square or free
 * aspect, and four labelled sliders as an exact, screen-reader friendly
 * alternative. The picture is shown through `<img>` only (object URL or
 * the sanitised SVG as data URI), never as markup.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx, FOCUS_RING } from "../controls/primitives";
import { useT } from "../i18n";
import { CHECKERBOARD_STYLE } from "../shell/preview";
import { BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from "../shell/styles";
import { useBackdropClose } from "../shell/use-backdrop-close";
import {
  initialCrop,
  moveCrop,
  resizeCrop,
  setCropField,
  withAspect,
  type CropAspect,
  type CropRect,
  type SourceSize,
} from "./crop";

export interface CropDialogProps {
  /** Object URL or data URI of the picture. */
  src: string;
  size: SourceSize;
  name: string;
  busy: boolean;
  /** Error text from applying the crop (encoding failed and similar). */
  error: string | null;
  onApply(crop: CropRect): void;
  onCancel(): void;
}

const FIELDS = ["x", "y", "w", "h"] as const;
const STEP = 0.01;
const BIG_STEP = 0.1;

export function CropDialog(props: CropDialogProps) {
  const t = useT();
  const ids = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<CropAspect>("free");
  const [crop, setCrop] = useState<CropRect>(() => initialCrop(props.size, "free"));
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; start: CropRect } | null>(
    null,
  );
  const { onCancel } = props;
  const backdropClose = useBackdropClose(onCancel);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    boxRef.current?.focus();
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
    };
  }, []);

  const changeAspect = (next: CropAspect) => {
    setAspect(next);
    setCrop((c) => withAspect(c, next, props.size));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = d[event.key];
    if (!delta) return;
    event.preventDefault();
    const [dx, dy] = delta;
    setCrop((c) =>
      event.altKey ? resizeCrop(c, dx, dy, aspect, props.size) : moveCrop(c, dx, dy),
    );
  };

  const startDrag = (event: PointerEvent<HTMLElement>, mode: "move" | "resize") => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    boxRef.current?.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, start: crop };
  };

  const onDrag = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!d || !stage || stage.width === 0 || stage.height === 0) return;
    const dx = (event.clientX - d.x) / stage.width;
    const dy = (event.clientY - d.y) / stage.height;
    setCrop(
      d.mode === "move"
        ? moveCrop(d.start, dx, dy)
        : resizeCrop(d.start, dx, dy, aspect, props.size),
    );
  };

  const endDrag = () => {
    drag.current = null;
  };

  const ratio = props.size.width / props.size.height;
  const percent = (v: number) => Math.round(v * 1000) / 10;

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${ids}-title`}
      aria-describedby={`${ids}-hint`}
      onCancel={(event) => {
        event.preventDefault();
        if (!props.busy) onCancel();
      }}
      {...backdropClose}
      className={cx(
        "m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-lg",
        "backdrop:bg-background/70 backdrop:backdrop-blur-sm",
      )}
      data-testid="crop-dialog"
    >
      <div className="grid max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto p-5">
        <div className="grid gap-1">
          <h2 id={`${ids}-title`} className="text-base font-semibold">
            {t("Editor.asset.crop.title")}
          </h2>
          <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
            {t("Editor.asset.crop.hint", { name: props.name || t("Editor.asset.yourFile") })}
          </p>
        </div>

        <div className="flex justify-center">
          <div
            ref={stageRef}
            className="relative max-h-80 max-w-full touch-none overflow-hidden rounded-md select-none"
            style={{
              ...CHECKERBOARD_STYLE,
              aspectRatio: `${props.size.width} / ${props.size.height}`,
              width: ratio >= 1 ? "20rem" : `${20 * ratio}rem`,
            }}
          >
            <img
              src={props.src}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute inset-0 block size-full max-w-none"
            />
            <div
              ref={boxRef}
              tabIndex={0}
              role="group"
              aria-roledescription={t("Editor.asset.crop.frame")}
              aria-label={t("Editor.asset.crop.frameLabel", {
                x: percent(crop.x),
                y: percent(crop.y),
                w: percent(crop.w),
                h: percent(crop.h),
              })}
              aria-describedby={`${ids}-keys`}
              onKeyDown={onKeyDown}
              onPointerDown={(e) => startDrag(e, "move")}
              onPointerMove={onDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className={cx(
                "absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.45)] outline-none",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
              }}
              data-testid="crop-frame"
            >
              <span
                aria-hidden="true"
                onPointerDown={(e) => startDrag(e, "resize")}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-sm border-2 border-white bg-primary"
              />
            </div>
          </div>
        </div>
        <p id={`${ids}-keys`} className="text-xs text-muted-foreground">
          {t("Editor.asset.crop.keys")}
        </p>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("Editor.asset.crop.aspect")}</legend>
          <div className="flex gap-2">
            {(["free", "square"] as const).map((value) => (
              <div key={value}>
                <input
                  id={`${ids}-aspect-${value}`}
                  type="radio"
                  name={`${ids}-aspect`}
                  checked={aspect === value}
                  onChange={() => changeAspect(value)}
                  className="peer sr-only"
                />
                <label
                  htmlFor={`${ids}-aspect-${value}`}
                  className={cx(
                    "inline-flex h-8 cursor-pointer items-center rounded-md border border-border bg-background px-3 text-sm",
                    "hover:bg-accent peer-checked:border-primary peer-checked:bg-accent peer-checked:font-medium",
                    "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                  )}
                >
                  {t(`Editor.asset.crop.aspects.${value}`)}
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {FIELDS.map((field) => {
            const id = `${ids}-${field}`;
            const value = percent(crop[field]);
            return (
              <div key={field} className="grid gap-1">
                <div className="flex items-center justify-between">
                  <label htmlFor={id} className="text-xs font-medium">
                    {t(`Editor.asset.crop.fields.${field}`)}
                  </label>
                  <output htmlFor={id} className="text-xs tabular-nums">
                    {value} %
                  </output>
                </div>
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={value}
                  aria-valuetext={`${value} %`}
                  onChange={(event) =>
                    setCrop((c) =>
                      setCropField(c, field, Number(event.target.value), aspect, props.size),
                    )
                  }
                  className={cx("w-full accent-primary", FOCUS_RING)}
                />
              </div>
            );
          })}
        </div>

        {props.error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {props.error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            className={cx(BUTTON_CLASS, "mr-auto")}
            onClick={() => setCrop(initialCrop(props.size, aspect))}
            disabled={props.busy}
          >
            {t("Editor.asset.crop.reset")}
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={onCancel} disabled={props.busy}>
            {t("Editor.asset.crop.cancel")}
          </button>
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={() => props.onApply(crop)}
            disabled={props.busy}
            data-testid="crop-apply"
          >
            {props.busy ? t("Editor.asset.crop.working") : t("Editor.asset.crop.apply")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
