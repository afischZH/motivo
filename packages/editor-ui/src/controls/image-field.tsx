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
import type { BrandAsset } from "@musterli/storage";
import type { ImageAsset } from "@musterli/tool-registry";
import { Popover } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import { useBrandKit, type BrandKitView } from "../brand-kit/context";
import { brandImageToFile } from "../brand-kit/prepare";
import { ASSET_ACCEPT } from "../asset-input/prepare";
import { useAssetLoader } from "../asset-input/use-asset-loader";
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

export function assetThumbnailUrl(asset: ImageAsset): string {
  return asset.kind === "svg" ? svgDataUrl(asset.svg) : asset.href;
}

export function ImageField(props: ImageFieldProps) {
  const t = useT();
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const brandKit = useBrandKit();
  const loader = useAssetLoader({
    onAsset: (asset) => {
      props.onChange(asset);
      props.onCommit?.();
    },
    onClose: () => fileRef.current?.focus(),
  });
  const { loadFile, reading, error, status } = loader;
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
            {brandKit && (
              <BrandAssetPicker
                kit={brandKit}
                disabled={reading}
                onPick={(picked) =>
                  void loadFile(brandImageToFile(picked.image, picked.image.name || picked.name))
                }
              />
            )}
            {asset && (
              <button
                type="button"
                className={BUTTON_CLASS}
                onClick={() => {
                  props.onChange(null);
                  props.onCommit?.();
                  loader.setStatus(t("Editor.asset.removedFile"));
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
              loader.clearError();
              fileRef.current?.focus();
            }}
            aria-label={t("Editor.asset.dismiss")}
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {loader.dialog}
    </div>
  );
}

/**
 * "Aus Brand Kit": logos and own shapes of the brand kit as a source for the
 * upload. A picked image runs through the same checks, sanitizer and crop
 * dialog as a file from disk.
 */
function BrandAssetPicker(props: {
  kit: BrandKitView;
  disabled: boolean;
  onPick(asset: BrandAsset): void;
}) {
  const t = useT();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<BrandAsset[] | null>(null);

  const load = () => {
    props.kit.listAssets().then(setAssets, () => setAssets([]));
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <Popover.Trigger
        className={BUTTON_CLASS}
        disabled={props.disabled}
        data-testid="asset-brand-kit"
      >
        {t("Editor.brand.fromKit")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="start"
          aria-labelledby={titleId}
          className="z-50 grid w-72 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
        >
          <p id={titleId} className="text-sm font-medium">
            {t("Editor.brand.assetsTitle")}
          </p>
          {assets === null ? (
            <p className="text-xs text-muted-foreground">{t("Editor.brand.loading")}</p>
          ) : assets.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("Editor.brand.assetsEmpty")}{" "}
              {props.kit.href && (
                <a
                  href={props.kit.href}
                  className="rounded-sm text-link underline underline-offset-4"
                >
                  {t("Editor.brand.openKit")}
                </a>
              )}
            </p>
          ) : (
            <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
              {assets.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={cx(
                      "flex w-full flex-col items-center gap-1 rounded-md border border-border p-1 text-xs hover:bg-accent",
                      FOCUS_RING,
                    )}
                    aria-label={t("Editor.brand.useAsset", {
                      name: a.name || t("Editor.brand.unnamed"),
                    })}
                    onClick={() => {
                      setOpen(false);
                      props.onPick(a);
                    }}
                    data-testid="asset-brand-item"
                  >
                    <span className="flex size-14 items-center justify-center overflow-hidden rounded-sm bg-canvas">
                      <img
                        src={assetThumbnailUrl(a.image)}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    </span>
                    <span className="w-full truncate">{a.name || t("Editor.brand.unnamed")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
