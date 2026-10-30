"use client";

import { zipBlob } from "@musterli/exporters";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_SETTINGS,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_FILES,
  MAX_IMAGE_FILE_BYTES,
  MAX_EDGE_MIN,
  OUTPUT_FORMATS,
  checkImageInput,
  normalizeSettings,
  outputFileName,
  savings,
  uniqueNames,
  type ImageConvertSettings,
} from "@/lib/convert/image-convert";
import type {
  ImageConvertFailure,
  ImageConvertRequest,
  ImageConvertResponse,
} from "@/lib/convert/image-convert.worker";
import { cn } from "@/lib/utils";

import { downloadFile } from "./download";

type ItemError = ImageConvertFailure | "tooLarge" | "unsupportedType" | "readFailed" | "noWorker";

type Item = {
  key: number;
  name: string;
  size: number;
  mime: string | null;
  bytes: ArrayBuffer | null;
  status: "pending" | "working" | "done" | "error";
  error?: ItemError | undefined;
  result?:
    | {
        blob: Blob;
        url: string;
        width: number;
        height: number;
        sourceWidth: number;
        sourceHeight: number;
      }
    | undefined;
};

const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp";

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

function useFormatBytes() {
  const format = useFormatter();
  return (bytes: number) =>
    bytes < 1024 * 1024
      ? format.number(bytes / 1024, { style: "unit", unit: "kilobyte", maximumFractionDigits: 1 })
      : format.number(bytes / (1024 * 1024), {
          style: "unit",
          unit: "megabyte",
          maximumFractionDigits: 1,
        });
}

export function ImageConverter() {
  const t = useTranslations("Converters");
  const formatBytes = useFormatBytes();
  const uid = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const nextKey = useRef(1);
  const nextRequest = useRef(1);
  /** request id → item key; a request for an older settings run is dropped. */
  const requests = useRef(new Map<number, number>());
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<ImageConvertSettings>(DEFAULT_SETTINGS);
  const [dragging, setDragging] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [zipping, setZipping] = useState(false);

  // The worker lives as long as the page; result URLs are revoked on removal.
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL("../../lib/convert/image-convert.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (event: MessageEvent<ImageConvertResponse>) => {
        const response = event.data;
        const key = requests.current.get(response.requestId);
        requests.current.delete(response.requestId);
        if (key === undefined) return;
        setItems((current) =>
          current.map((item) => {
            if (item.key !== key) return item;
            if (item.result) URL.revokeObjectURL(item.result.url);
            if (!response.ok)
              return { ...item, status: "error", error: response.error, result: undefined };
            const { blob, width, height, sourceWidth, sourceHeight } = response;
            return {
              ...item,
              status: "done",
              error: undefined,
              result: {
                blob,
                url: URL.createObjectURL(blob),
                width,
                height,
                sourceWidth,
                sourceHeight,
              },
            };
          }),
        );
      };
      workerRef.current = worker;
      return () => worker.terminate();
    } catch {
      workerRef.current = null;
    }
  }, []);

  // Revoke every preview URL when the page goes away.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  useEffect(
    () => () => {
      for (const item of itemsRef.current) if (item.result) URL.revokeObjectURL(item.result.url);
    },
    [],
  );

  function send(item: Item, using: ImageConvertSettings) {
    if (!item.bytes || !item.mime) return;
    const worker = workerRef.current;
    if (!worker) {
      setItems((cur) =>
        cur.map((i) => (i.key === item.key ? { ...i, status: "error", error: "noWorker" } : i)),
      );
      return;
    }
    // Drop older requests of this item, only the newest settings count.
    for (const [id, key] of requests.current) if (key === item.key) requests.current.delete(id);
    const requestId = nextRequest.current++;
    requests.current.set(requestId, item.key);
    // The worker gets a copy; the item keeps its bytes for a new run.
    const message: ImageConvertRequest = {
      requestId,
      bytes: item.bytes.slice(0),
      mime: item.mime,
      settings: using,
    };
    worker.postMessage(message, [message.bytes]);
  }

  // Re-encode everything when the settings change (debounced for the slider).
  useEffect(() => {
    const timer = setTimeout(() => {
      const current = itemsRef.current;
      if (current.length === 0) return;
      for (const item of current) if (item.bytes) send(item, settings);
      setItems((list) => list.map((item) => (item.bytes ? { ...item, status: "working" } : item)));
    }, 250);
    return () => clearTimeout(timer);
  }, [settings]);

  async function addFiles(files: readonly File[]) {
    const room = MAX_IMAGE_FILES - items.length;
    setLimitHit(files.length > room);
    const added: Item[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const key = nextKey.current++;
      const base = { key, name: file.name, size: file.size, mime: null, bytes: null };
      try {
        const bytes = await file.arrayBuffer();
        const check = checkImageInput(
          new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 1024)),
          file.size,
        );
        if (!check.ok) {
          added.push({ ...base, status: "error", error: check.error });
          continue;
        }
        added.push({ ...base, mime: check.mime, bytes, status: "working" });
      } catch {
        added.push({ ...base, status: "error", error: "readFailed" });
      }
    }
    setItems((current) => [...current, ...added]);
    for (const item of added) send(item, settings);
  }

  // Paste images from the clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = Array.from(event.clipboardData?.files ?? []);
      if (pasted.length === 0) return;
      event.preventDefault();
      void addFiles(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function remove(key: number) {
    setItems((current) => {
      const item = current.find((i) => i.key === key);
      if (item?.result) URL.revokeObjectURL(item.result.url);
      return current.filter((i) => i.key !== key);
    });
  }

  function clear() {
    for (const item of items) if (item.result) URL.revokeObjectURL(item.result.url);
    requests.current.clear();
    setItems([]);
    setLimitHit(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const done = items.filter((i) => i.status === "done" && i.result);
  const names = uniqueNames(done.map((i) => outputFileName(i.name, settings.format)));
  const totalBefore = done.reduce((sum, i) => sum + i.size, 0);
  const totalAfter = done.reduce((sum, i) => sum + (i.result?.blob.size ?? 0), 0);
  const working = items.some((i) => i.status === "working");

  async function downloadAll() {
    setZipping(true);
    try {
      const entries = await Promise.all(
        done.map(async (item, i) => ({
          path: names[i] ?? `image-${i + 1}`,
          data: new Uint8Array(
            await (item.result as NonNullable<Item["result"]>).blob.arrayBuffer(),
          ),
        })),
      );
      // Already compressed images: storing is as small and much faster.
      downloadFile(await zipBlob(entries, { compress: false }), "musterli-images.zip");
    } finally {
      setZipping(false);
    }
  }

  const update = (patch: Partial<ImageConvertSettings>) =>
    setSettings((current) => normalizeSettings({ ...current, ...patch }));

  const errorText = (error: ItemError) =>
    error === "tooLarge"
      ? t("common.errors.tooLarge", { limit: formatBytes(MAX_IMAGE_FILE_BYTES) })
      : error === "tooManyPixels"
        ? t("image.errors.tooManyPixels", { limit: MAX_IMAGE_EDGE })
        : error === "unsupportedType"
          ? t("image.errors.unsupportedType")
          : error === "readFailed"
            ? t("common.errors.readFailed")
            : t(`image.errors.${error}`);

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          if (selected.length > 0) void addFiles(selected);
          event.target.value = "";
        }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby={`${uid}-input`} className="flex min-w-0 flex-col gap-3">
          <h2 id={`${uid}-input`} className="text-xl font-semibold tracking-tight">
            {t("common.input")}
          </h2>
          <div
            onDragOver={(event) => {
              if (!hasFiles(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              setDragging(false);
              const dropped = Array.from(event.dataTransfer.files);
              if (dropped.length === 0) return;
              event.preventDefault();
              void addFiles(dropped);
            }}
            className={cn(
              "flex min-h-44 flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-input bg-muted p-6 text-center transition-colors",
              dragging && "border-ring bg-highlight",
            )}
          >
            <Button
              type="button"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              aria-describedby={`${uid}-hint`}
            >
              {t("image.dropzone")}
            </Button>
            <p id={`${uid}-hint`} className="text-sm text-muted-foreground">
              {t("image.hint", {
                count: MAX_IMAGE_FILES,
                limit: formatBytes(MAX_IMAGE_FILE_BYTES),
              })}
            </p>
          </div>
          {limitHit && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {t("image.errors.tooManyFiles", { count: MAX_IMAGE_FILES })}
            </p>
          )}
        </section>

        <section aria-labelledby={`${uid}-settings`} className="flex min-w-0 flex-col gap-4">
          <h2 id={`${uid}-settings`} className="text-xl font-semibold tracking-tight">
            {t("image.settings")}
          </h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t("common.format")}</legend>
            <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-control bg-muted p-1">
              {OUTPUT_FORMATS.map((option) => (
                <label
                  key={option}
                  className={cn(
                    "relative cursor-pointer rounded-control px-3 py-1.5 text-sm text-muted-foreground transition-colors",
                    "hover:text-foreground has-checked:bg-background has-checked:font-medium has-checked:text-foreground has-checked:shadow-sm",
                    "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                  )}
                >
                  <input
                    type="radio"
                    name={`${uid}-format`}
                    value={option}
                    checked={settings.format === option}
                    onChange={() => update({ format: option })}
                    className="sr-only"
                  />
                  {t(`image.formats.${option}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {settings.format !== "png" && (
            <div className="flex flex-col gap-2">
              <label
                htmlFor={`${uid}-quality`}
                className="flex justify-between text-sm font-medium"
              >
                <span>{t("image.quality")}</span>
                <span className="tabular-nums text-muted-foreground">{settings.quality}</span>
              </label>
              <input
                id={`${uid}-quality`}
                type="range"
                min={1}
                max={100}
                value={settings.quality}
                onChange={(event) => update({ quality: Number(event.target.value) })}
                className="w-full accent-primary"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={settings.maxEdge !== null}
                onChange={(event) => update({ maxEdge: event.target.checked ? 1920 : null })}
                className="size-4 accent-primary"
              />
              {t("image.resize")}
            </label>
            {settings.maxEdge !== null && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("image.maxEdge")}</span>
                <input
                  type="number"
                  min={MAX_EDGE_MIN}
                  max={MAX_IMAGE_EDGE}
                  step={1}
                  value={settings.maxEdge}
                  onChange={(event) => update({ maxEdge: Number(event.target.value) })}
                  className="h-9 w-28 rounded-control border border-input bg-background px-3 tabular-nums"
                />
                <span className="text-muted-foreground">px</span>
              </label>
            )}
          </div>

          {settings.format === "jpeg" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="color"
                value={settings.matte}
                onChange={(event) => update({ matte: event.target.value })}
                className="h-8 w-10 cursor-pointer rounded-control border border-input bg-background"
              />
              {t("image.matte")}
            </label>
          )}
          <p className="text-sm text-muted-foreground">{t("common.privacy")}</p>
        </section>
      </div>

      <section
        aria-labelledby={`${uid}-output`}
        aria-busy={working}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={`${uid}-output`} className="text-xl font-semibold tracking-tight">
            {t("common.output")}
          </h2>
          {done.length > 0 && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("image.total", {
                before: formatBytes(totalBefore),
                after: formatBytes(totalAfter),
                percent: savings(totalBefore, totalAfter),
              })}
            </p>
          )}
        </div>
        {items.length === 0 ? (
          <p className="rounded-card border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
            {t("image.empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
            {items.map((item) => {
              const doneIndex = done.indexOf(item);
              const name =
                doneIndex >= 0 ? names[doneIndex] : outputFileName(item.name, settings.format);
              const saved = item.result ? savings(item.size, item.result.blob.size) : 0;
              return (
                <li key={item.key} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-control bg-muted">
                    {item.result && (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                      <img
                        src={item.result.url}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {item.status === "error" && item.error ? (
                      <p role="alert" className="text-sm text-destructive">
                        {errorText(item.error)}
                      </p>
                    ) : item.result ? (
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {formatBytes(item.size)} → {formatBytes(item.result.blob.size)} ·{" "}
                        <span className={saved < 0 ? "text-destructive" : undefined}>
                          {saved >= 0
                            ? t("image.saved", { percent: saved })
                            : t("image.larger", { percent: -saved })}
                        </span>{" "}
                        ·{" "}
                        {t("common.dimensions", {
                          width: item.result.width,
                          height: item.result.height,
                        })}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("common.working")}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {item.result && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          item.result && downloadFile(item.result.blob, name ?? "image")
                        }
                      >
                        {t("common.download")}
                        <span className="sr-only">: {name}</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(item.key)}
                    >
                      {t("image.remove")}
                      <span className="sr-only">: {item.name}</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {done.length > 1 && (
            <Button type="button" onClick={() => void downloadAll()} disabled={zipping || working}>
              {t("image.downloadAll", { count: done.length })}
            </Button>
          )}
          {items.length > 0 && (
            <Button type="button" variant="ghost" onClick={clear}>
              {t("common.clear")}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
