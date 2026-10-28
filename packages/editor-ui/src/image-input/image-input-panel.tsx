"use client";

/**
 * Generic image picker for tools with `imageInput` (docs/DESIGN.md 3,
 * "Bild-Upload"): drop zone, file button, paste from the clipboard, a
 * thumbnail of the active picture and a way back to the sample. Status and
 * errors are announced through live regions. No tool-specific code.
 */
import type { PixelBuffer } from "@musterli/tool-registry";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { cx, FOCUS_RING } from "../controls/primitives";
import { useT } from "../i18n";
import { CloseIcon } from "../shell/icons";
import { BUTTON_CLASS, ICON_BUTTON } from "../shell/styles";
import { IMAGE_INPUT_ACCEPT } from "./check";
import type { ImageInputControls } from "./use-image-input";

/** Draws the downsampled pixels; CSS scales the canvas to fit its box. */
function PixelThumbnail({ pixels, label }: { pixels: PixelBuffer | null; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    // Without canvas support (jsdom) the thumbnail stays empty; it is decorative.
    if (!canvas || !pixels || typeof ImageData === "undefined") return;
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas
      .getContext("2d")
      ?.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width), 0, 0);
  }, [pixels]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="max-h-full max-w-full object-contain"
      data-testid="image-input-thumbnail"
    />
  );
}

/** True when the paste target edits text, so pasting there must not load an image. */
export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return (
    target instanceof HTMLInputElement &&
    !["file", "button", "checkbox", "radio", "range"].includes(target.type)
  );
}

export function ImageInputPanel({ input }: { input: ImageInputControls }) {
  const t = useT();
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { loadFile } = input;

  // Paste an image anywhere in the editor (DESIGN.md 3), except into text fields.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTextTarget(event.target)) return;
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      loadFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  const onDrag = (event: DragEvent<HTMLDivElement>, over: boolean) => {
    if (![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    if (over) event.dataTransfer.dropEffect = "copy";
    setDragging(over);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) loadFile(file);
  };

  const user = input.source.kind === "user" ? input.source : null;
  const sourceName = user
    ? user.name || t("Editor.imageInput.yourImage")
    : t("Editor.imageInput.sample");
  const status =
    input.status === "loading"
      ? t("Editor.imageInput.loading")
      : input.status === "analysing"
        ? t("Editor.imageInput.analysing")
        : input.loadedCount > 0 && user
          ? t("Editor.imageInput.ready", { name: sourceName })
          : "";

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-2 border-b border-border pb-4"
      data-testid="image-input"
    >
      <h3 id={`${ids}-title`} className="text-sm font-semibold">
        {t("Editor.imageInput.title")}
      </h3>
      <div
        role="group"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-hint`}
        onDragEnter={(e) => onDrag(e, true)}
        onDragOver={(e) => onDrag(e, true)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        className={cx(
          "grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-dashed p-2",
          dragging ? "border-primary bg-accent" : "border-border",
        )}
        data-testid="image-input-dropzone"
        data-dragging={dragging || undefined}
      >
        <span className="flex size-20 items-center justify-center overflow-hidden rounded-md bg-canvas">
          <PixelThumbnail
            pixels={input.pixels}
            label={
              user
                ? t("Editor.imageInput.thumbnailUser", { name: sourceName })
                : t("Editor.imageInput.thumbnailSample")
            }
          />
        </span>
        <div className="grid min-w-0 gap-2">
          <p className="truncate text-sm text-foreground" data-testid="image-input-source">
            {dragging ? t("Editor.imageInput.dropNow") : sourceName}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              id={`${ids}-file`}
              type="file"
              accept={IMAGE_INPUT_ACCEPT}
              className="peer sr-only"
              aria-describedby={`${ids}-hint`}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) loadFile(file);
                // Allows picking the same file again.
                event.currentTarget.value = "";
              }}
              data-testid="image-input-file"
            />
            <label
              htmlFor={`${ids}-file`}
              className={cx(
                BUTTON_CLASS,
                "cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
              )}
            >
              {t("Editor.imageInput.choose")}
            </label>
            {user && (
              <button
                type="button"
                className={BUTTON_CLASS}
                onClick={() => {
                  input.resetToSample();
                  // The button disappears with the user image: keep focus in the panel.
                  fileRef.current?.focus();
                }}
              >
                {t("Editor.imageInput.useSample")}
              </button>
            )}
          </div>
        </div>
      </div>
      <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
        {t("Editor.imageInput.hint")}
      </p>
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
        data-testid="image-input-status"
      >
        {status}
      </p>
      {input.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-sm"
          data-testid="image-input-error"
        >
          <p className="min-w-0 flex-1">{t(`Editor.imageInput.errors.${input.error}`)}</p>
          <button
            type="button"
            className={cx(ICON_BUTTON, FOCUS_RING)}
            onClick={() => {
              input.dismissError();
              // The alert and its button disappear: keep focus in the panel.
              fileRef.current?.focus();
            }}
            aria-label={t("Editor.imageInput.dismiss")}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </section>
  );
}
