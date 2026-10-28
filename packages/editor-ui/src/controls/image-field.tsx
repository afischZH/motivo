"use client";

/**
 * Upload field for params of `kind: "image"` (Seamless Patterns motif):
 * drop zone, file button, paste, a thumbnail of the current asset, replace
 * and remove. A new file is checked and (for SVG) sanitised by `readAsset`
 * in the sanitize worker, then cropped in the `CropDialog` and turned into
 * an `ImageAsset`. A newer file or unmounting aborts the work in progress.
 *
 * Everything stays in the browser. User SVG is only ever shown through
 * `<img>` (sanitised markup as data URI), never inserted as markup.
 */
import type { ImageAsset } from "@motivo/tool-registry";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import { CropDialog } from "../asset-input/crop-dialog";
import {
  finishAsset,
  readAsset,
  sourceSize,
  ASSET_ACCEPT,
  type AssetError,
  type AssetSource,
} from "../asset-input/prepare";
import { useAssetServices, useSvgSanitizer } from "../asset-input/services-context";
import type { CropRect } from "../asset-input/crop";
import { useT } from "../i18n";
import { isTextTarget } from "../image-input/image-input-panel";
import { CloseIcon } from "../shell/icons";
import { svgDataUrl } from "../shell/render";
import { BUTTON_CLASS, ICON_BUTTON } from "../shell/styles";
import { cx, FOCUS_RING, type ControlIds } from "./primitives";

export interface ImageFieldProps {
  ids: ControlIds;
  label: string;
  value: ImageAsset | null;
  onChange(value: ImageAsset | null): void;
  onCommit?(): void;
}

/** Shows the source in the crop dialog: object URL for raster, data URI for sanitised SVG. */
function useSourceUrl(source: AssetSource | null): string | null {
  const objectUrl = useMemo(() => {
    if (!source || source.kind !== "raster" || typeof URL.createObjectURL !== "function") {
      return null;
    }
    return URL.createObjectURL(new Blob([source.bytes as BlobPart], { type: source.mime }));
  }, [source]);
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );
  if (!source) return null;
  if (source.kind === "svg") return svgDataUrl(source.svg);
  return objectUrl ?? "";
}

export function assetThumbnailUrl(asset: ImageAsset): string {
  return asset.kind === "svg" ? svgDataUrl(asset.svg) : asset.href;
}

/** Aborts the previous controller whenever a new one is taken, and on unmount. */
function useAbortSlot(): () => AbortSignal {
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), []);
  return () => {
    current.current?.abort();
    current.current = new AbortController();
    return current.current.signal;
  };
}

export function ImageField(props: ImageFieldProps) {
  const t = useT();
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const getServices = useAssetServices();
  const getSanitizer = useSvgSanitizer();
  const nextSignal = useAbortSlot();
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<AssetError | null>(null);
  const [source, setSource] = useState<AssetSource | null>(null);
  const [applying, setApplying] = useState(false);
  const [cropError, setCropError] = useState<AssetError | null>(null);
  const [status, setStatus] = useState("");
  const sourceUrl = useSourceUrl(source);
  const loadToken = useRef(0);

  const loadFile = async (file: File) => {
    const token = ++loadToken.current;
    setError(null);
    setStatus(t("Editor.asset.reading"));
    setReading(true);
    const result = await readAsset(file, { svg: getSanitizer(), signal: nextSignal() });
    if (token !== loadToken.current) return;
    setReading(false);
    if (!result.ok) {
      setStatus("");
      if (result.error !== "aborted") setError(result.error);
      return;
    }
    setStatus(
      result.source.kind === "svg" && result.source.removed > 0
        ? t("Editor.asset.removed", { count: result.source.removed })
        : "",
    );
    setCropError(null);
    setSource(result.source);
  };
  const loadRef = useRef(loadFile);
  useEffect(() => {
    loadRef.current = loadFile;
  });

  // Paste a picture anywhere in the editor, except into text fields.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTextTarget(event.target)) return;
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      void loadRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const onDrag = (event: DragEvent<HTMLDivElement>, over: boolean) => {
    if (![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    if (over) event.dataTransfer.dropEffect = "copy";
    setDragging(over);
  };

  const closeCrop = () => {
    setSource(null);
    setApplying(false);
    setCropError(null);
    fileRef.current?.focus();
  };

  const apply = async (crop: CropRect) => {
    if (!source) return;
    setApplying(true);
    setCropError(null);
    const result = await finishAsset(
      source,
      crop,
      { crop: getServices().crop, svg: getSanitizer() },
      nextSignal(),
    );
    if (!result.ok) {
      setApplying(false);
      if (result.error !== "aborted") setCropError(result.error);
      return;
    }
    const name = result.asset.name || t("Editor.asset.yourFile");
    props.onChange(result.asset);
    props.onCommit?.();
    setStatus(t("Editor.asset.ready", { name }));
    closeCrop();
  };

  const asset = props.value;
  // Encoding a large SVG takes a few ms: once per asset, not per render.
  const thumbnailUrl = useMemo(() => (asset ? assetThumbnailUrl(asset) : null), [asset]);
  const name = asset ? asset.name || t("Editor.asset.yourFile") : null;

  return (
    <div className="grid min-w-0 gap-2" data-testid="asset-field">
      <div
        role="group"
        aria-labelledby={props.ids.label}
        aria-describedby={`${ids}-hint`}
        onDragEnter={(e) => onDrag(e, true)}
        onDragOver={(e) => onDrag(e, true)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void loadFile(file);
        }}
        className={cx(
          "grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-dashed p-2",
          dragging ? "border-primary bg-accent" : "border-border",
        )}
        data-testid="asset-dropzone"
        data-dragging={dragging || undefined}
      >
        <span className="flex size-16 items-center justify-center overflow-hidden rounded-md bg-canvas">
          {asset && (
            <img
              src={thumbnailUrl ?? ""}
              alt={t("Editor.asset.thumbnail", { name: name ?? "" })}
              className="max-h-full max-w-full object-contain"
              data-testid="asset-thumbnail"
            />
          )}
        </span>
        <div className="grid min-w-0 gap-2">
          <p className="truncate text-sm text-foreground" data-testid="asset-name">
            {dragging ? t("Editor.asset.dropNow") : (name ?? t("Editor.asset.none"))}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              id={props.ids.input}
              type="file"
              accept={ASSET_ACCEPT}
              className="peer sr-only"
              aria-describedby={`${ids}-hint`}
              disabled={reading}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void loadFile(file);
                event.currentTarget.value = "";
              }}
              data-testid="asset-file"
            />
            <label
              htmlFor={props.ids.input}
              className={cx(
                BUTTON_CLASS,
                "cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
              )}
            >
              {asset ? t("Editor.asset.replace") : t("Editor.asset.choose")}
            </label>
            {asset && (
              <button
                type="button"
                className={BUTTON_CLASS}
                onClick={() => {
                  props.onChange(null);
                  props.onCommit?.();
                  setStatus(t("Editor.asset.removedFile"));
                  fileRef.current?.focus();
                }}
                data-testid="asset-remove"
              >
                {t("Editor.asset.remove")}
              </button>
            )}
          </div>
        </div>
      </div>
      <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
        {t("Editor.asset.hint")}
      </p>
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
        data-testid="asset-status"
      >
        {status}
      </p>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-sm"
          data-testid="asset-error"
        >
          <p className="min-w-0 flex-1">{t(`Editor.asset.errors.${error}`)}</p>
          <button
            type="button"
            className={cx(ICON_BUTTON, FOCUS_RING)}
            onClick={() => {
              setError(null);
              fileRef.current?.focus();
            }}
            aria-label={t("Editor.asset.dismiss")}
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {source && sourceUrl !== null && (
        <CropDialog
          src={sourceUrl}
          size={sourceSize(source)}
          name={source.name}
          busy={applying}
          error={cropError ? t(`Editor.asset.errors.${cropError}`) : null}
          onApply={(crop) => void apply(crop)}
          onCancel={closeCrop}
        />
      )}
    </div>
  );
}
