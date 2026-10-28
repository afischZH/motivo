"use client";

/**
 * The upload pipeline of image params, shared by the upload field and the
 * "Brand Kit" group of the shape picker: a file is checked and (for SVG)
 * sanitised by `readAsset` in the sanitize worker, then cropped in the
 * `CropDialog` and turned into an `ImageAsset`. A newer file or unmounting
 * aborts the work in progress.
 */
import type { ImageAsset } from "@musterli/tool-registry";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { svgDataUrl } from "../shell/render";
import type { CropRect } from "./crop";
import { CropDialog } from "./crop-dialog";
import {
  finishAsset,
  readAsset,
  sourceSize,
  type AssetError,
  type AssetOutputOptions,
  type AssetSource,
} from "./prepare";
import { useAssetServices, useSvgSanitizer } from "./services-context";

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

export interface AssetLoaderOptions {
  /** A finished asset (after the crop dialog). */
  onAsset(asset: ImageAsset): void;
  /** The crop dialog closed (applied or cancelled): put the focus back. */
  onClose?(): void;
  /** Encoding and limits of the finished asset (`ImageHint` of the field). */
  output?: AssetOutputOptions;
}

export interface AssetLoader {
  loadFile(file: File): Promise<void>;
  reading: boolean;
  error: AssetError | null;
  clearError(): void;
  /** Text for an `aria-live` status line. */
  status: string;
  setStatus(text: string): void;
  /** The crop dialog while a source is open, else `null`. */
  dialog: ReactNode;
}

export function useAssetLoader(options: AssetLoaderOptions): AssetLoader {
  const t = useT();
  const getServices = useAssetServices();
  const getSanitizer = useSvgSanitizer();
  const nextSignal = useAbortSlot();
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
    const result = await readAsset(file, {
      svg: getSanitizer(),
      signal: nextSignal(),
      rasterOnly: options.output?.rasterOnly === true,
    });
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

  const closeCrop = () => {
    setSource(null);
    setApplying(false);
    setCropError(null);
    options.onClose?.();
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
      options.output,
    );
    if (!result.ok) {
      setApplying(false);
      if (result.error !== "aborted") setCropError(result.error);
      return;
    }
    const name = result.asset.name || t("Editor.asset.yourFile");
    options.onAsset(result.asset);
    setStatus(t("Editor.asset.ready", { name }));
    closeCrop();
  };

  const dialog =
    source && sourceUrl !== null ? (
      <CropDialog
        src={sourceUrl}
        size={sourceSize(source)}
        name={source.name}
        busy={applying}
        error={cropError ? t(`Editor.asset.errors.${cropError}`) : null}
        onApply={(crop) => void apply(crop)}
        onCancel={closeCrop}
      />
    ) : null;

  return {
    loadFile,
    reading,
    error,
    clearError: () => setError(null),
    status,
    setStatus,
    dialog,
  };
}
