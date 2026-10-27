"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  MAX_INPUT_BYTES,
  formatDataUri,
  type ConvertError,
  type OutputFormat,
} from "@/lib/convert/converters";
import type { ConverterId } from "@/lib/convert/ids";
import type { ConverterOutput } from "@/lib/convert/run";
import { sampleInput } from "@/lib/convert/samples";
import { cn } from "@/lib/utils";

import { downloadFile } from "./download";
import { useConverter } from "./use-converter";

/** Output formats for converters that produce a data URI; the first is the default. */
const FORMATS: Partial<Record<ConverterId, readonly OutputFormat[]>> = {
  "svg-to-css": ["css", "dataUri", "html"],
  "svg-to-base64": ["dataUri", "base64", "css", "html"],
  "image-to-base64": ["dataUri", "base64", "css", "html"],
};

const FILE_ACCEPT: Record<ConverterId, string> = {
  "svg-to-css": ".svg,image/svg+xml",
  "svg-to-base64": ".svg,image/svg+xml",
  "css-to-svg": ".css,.txt,.html,text/css,text/plain,text/html",
  "base64-to-svg": ".txt,text/plain",
  "base64-to-image": ".txt,text/plain",
  "image-to-base64":
    ".png,.jpg,.jpeg,.gif,.webp,.svg,image/png,image/jpeg,image/gif,image/webp,image/svg+xml",
};

/** Text files are only pre-checked roughly; the converter applies the exact limit. */
const MAX_TEXT_FILE_BYTES = MAX_INPUT_BYTES * 2;

/** Longer results are shown truncated; copy and download always use the full text. */
const DISPLAY_LIMIT = 100_000;

type FileError = Extract<ConvertError, "tooLarge"> | "readFailed";
type CopyState = "idle" | "copied" | "failed";

function useFormatBytes() {
  const format = useFormatter();
  return (bytes: number) => {
    if (bytes < 1024) return format.number(bytes, { style: "unit", unit: "byte" });
    if (bytes < 1024 * 1024) {
      return format.number(bytes / 1024, {
        style: "unit",
        unit: "kilobyte",
        maximumFractionDigits: 1,
      });
    }
    return format.number(bytes / (1024 * 1024), {
      style: "unit",
      unit: "megabyte",
      maximumFractionDigits: 1,
    });
  };
}

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

export function Converter({ id }: { id: ConverterId }) {
  const t = useTranslations("Converters");
  const formatBytes = useFormatBytes();
  const uid = useId();
  const ids = {
    input: `${uid}-input`,
    hint: `${uid}-hint`,
    error: `${uid}-error`,
    output: `${uid}-output`,
    truncated: `${uid}-truncated`,
  };

  const isFileInput = id === "image-to-base64";
  // Base64 to image yields a file, not text to copy.
  const hasTextOutput = id !== "base64-to-image";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [fileError, setFileError] = useState<FileError | null>(null);
  const [dragging, setDragging] = useState(false);
  const formats = FORMATS[id];
  const [format, setFormat] = useState<OutputFormat>(formats?.[0] ?? "dataUri");
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const { working, result } = useConverter(id, isFileInput ? (file?.bytes ?? null) : text);
  const output = result?.ok ? result.value : null;
  const error: ConvertError | FileError | null =
    fileError ?? (result && !result.ok && result.error !== "empty" ? result.error : null);

  const outputText = output ? outputTextOf(output, format) : null;
  const sample = sampleInput(id);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 3000);
    return () => clearTimeout(timer);
  }, [copyState]);

  // Paste an image from the clipboard anywhere on the page.
  useEffect(() => {
    if (!isFileInput) return;
    const onPaste = (event: ClipboardEvent) => {
      const pasted = event.clipboardData?.files[0];
      if (!pasted) return;
      event.preventDefault();
      void readFile(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // readFile only uses setters and constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFileInput]);

  async function readFile(selected: File) {
    const limit = isFileInput ? MAX_INPUT_BYTES : MAX_TEXT_FILE_BYTES;
    if (selected.size > limit) {
      setFileError("tooLarge");
      return;
    }
    try {
      if (isFileInput) {
        setFile({ name: selected.name, bytes: new Uint8Array(await selected.arrayBuffer()) });
      } else {
        setText(await selected.text());
      }
      setFileError(null);
    } catch {
      setFileError("readFailed");
    }
  }

  function onDragOver(event: DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function onDrop(event: DragEvent) {
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (!dropped) return;
    event.preventDefault();
    void readFile(dropped);
  }

  function clear() {
    setText("");
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function copy() {
    if (outputText === null) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function download() {
    if (!output) return;
    if (output.kind === "image")
      downloadFile(output.bytes as Uint8Array<ArrayBuffer>, `image.${output.extension}`);
    else if (output.kind === "svg") downloadFile(output.svg, "image.svg");
    else if (outputText !== null)
      downloadFile(outputText, format === "css" ? `${id}.css` : `${id}.txt`);
  }

  const errorText =
    error === null
      ? null
      : error === "tooLarge"
        ? t("common.errors.tooLarge", { limit: formatBytes(MAX_INPUT_BYTES) })
        : t(`common.errors.${error}`);
  const truncated = outputText !== null && outputText.length > DISPLAY_LIMIT;

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={FILE_ACCEPT[id]}
      hidden
      onChange={(event) => {
        const selected = event.target.files?.[0];
        if (selected) void readFile(selected);
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby={`${uid}-input-heading`} className="flex min-w-0 flex-col gap-3">
          <h2 id={`${uid}-input-heading`} className="text-xl font-semibold tracking-tight">
            {t("common.input")}
          </h2>
          {fileInput}
          {isFileInput ? (
            <div
              onDragOver={onDragOver}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex min-h-56 flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-input bg-muted p-6 text-center transition-colors",
                dragging && "border-ring bg-highlight",
              )}
            >
              <Button
                type="button"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                aria-describedby={error ? ids.error : ids.hint}
              >
                {t("common.dropzone")}
              </Button>
              <p id={ids.hint} className="text-sm text-muted-foreground">
                {t("common.pasteHint")}
              </p>
              {file && (
                <p className="text-sm break-all">
                  {t("common.selectedFile", { name: file.name })} ({formatBytes(file.bytes.length)})
                </p>
              )}
            </div>
          ) : (
            <>
              <label htmlFor={ids.input} className="text-sm font-medium">
                {t(`items.${id}.inputLabel`)}
              </label>
              <textarea
                id={ids.input}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setFileError(null);
                }}
                onDragOver={onDragOver}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                placeholder={t(`items.${id}.placeholder`)}
                rows={12}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                aria-invalid={error !== null}
                aria-describedby={error ? `${ids.error} ${ids.hint}` : ids.hint}
                className={cn(
                  "min-h-56 w-full resize-y rounded-control border border-input bg-background p-3 font-mono text-xs leading-relaxed",
                  "placeholder:text-muted-foreground aria-invalid:border-destructive",
                  dragging && "border-ring bg-highlight",
                )}
              />
              <p id={ids.hint} className="text-sm text-muted-foreground">
                {t("common.dropHint")}
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!isFileInput && (
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                {t("common.chooseFile")}
              </Button>
            )}
            {sample !== null && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setText(sample);
                  setFileError(null);
                }}
              >
                {t("common.example")}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={clear}
              disabled={text === "" && file === null && error === null}
            >
              {t("common.clear")}
            </Button>
          </div>
          {errorText !== null && (
            <p id={ids.error} role="alert" className="text-sm font-medium text-destructive">
              {errorText}
            </p>
          )}
        </section>

        <section
          aria-labelledby={`${uid}-output-heading`}
          aria-busy={working}
          className="flex min-w-0 flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={`${uid}-output-heading`} className="text-xl font-semibold tracking-tight">
              {t("common.output")}
            </h2>
            {working && (
              <span className="text-sm text-muted-foreground">{t("common.working")}</span>
            )}
          </div>

          {formats && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("common.format")}</legend>
              <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-control bg-muted p-1">
                {formats.map((option) => (
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
                      checked={format === option}
                      onChange={() => setFormat(option)}
                      className="sr-only"
                    />
                    {t(`common.formats.${option}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {hasTextOutput && (
            <>
              <label htmlFor={ids.output} className="text-sm font-medium">
                {t("common.outputLabel")}
              </label>
              <textarea
                id={ids.output}
                readOnly
                value={
                  outputText === null
                    ? ""
                    : truncated
                      ? `${outputText.slice(0, DISPLAY_LIMIT)} …`
                      : outputText
                }
                rows={12}
                spellCheck={false}
                aria-describedby={truncated ? ids.truncated : undefined}
                className="min-h-56 w-full resize-y rounded-control border border-input bg-muted p-3 font-mono text-xs leading-relaxed break-all"
              />
              {truncated && (
                <p id={ids.truncated} className="text-sm text-muted-foreground">
                  {t("common.truncated")}
                </p>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {hasTextOutput && (
              <Button type="button" onClick={copy} disabled={outputText === null}>
                {t("common.copy")}
              </Button>
            )}
            <Button
              type="button"
              variant={!hasTextOutput ? "default" : "outline"}
              onClick={download}
              disabled={output === null}
            >
              {t("common.download")}
            </Button>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {copyState === "copied"
                ? t("common.copied")
                : copyState === "failed"
                  ? t("common.copyFailed")
                  : ""}
            </p>
          </div>

          {output && output.kind === "dataUri" && outputText !== null && (
            <p className="text-sm text-muted-foreground">
              {t("common.outputSize", { size: formatBytes(outputText.length) })}
            </p>
          )}
          {output?.notes.map((note) => (
            <p key={note} className="rounded-control bg-highlight px-3 py-2 text-sm">
              {note === "multipleFound" && output.kind === "svg"
                ? t("common.notes.multipleFound", { count: output.found })
                : note === "typeMismatch" && output.kind === "image"
                  ? t("common.notes.typeMismatch", { type: output.extension.toUpperCase() })
                  : t("common.notes.addedNamespace")}
            </p>
          ))}
        </section>
      </div>

      <Preview
        key={previewKey(output)}
        output={output}
        title={t("common.preview")}
        empty={t("common.previewEmpty")}
        alt={t("common.previewAlt")}
      >
        {(dimensions) =>
          output?.kind === "image" ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t("common.imageType")}</dt>
              <dd>{output.extension.toUpperCase()}</dd>
              <dt className="text-muted-foreground">{t("common.imageSize")}</dt>
              <dd>{formatBytes(output.bytes.length)}</dd>
              {dimensions && (
                <>
                  <dt className="text-muted-foreground">{t("common.imageDimensions")}</dt>
                  <dd className="tabular-nums">{t("common.dimensions", dimensions)}</dd>
                </>
              )}
            </dl>
          ) : null
        }
      </Preview>

      <p className="text-sm text-muted-foreground">{t("common.privacy")}</p>
    </div>
  );
}

function outputTextOf(output: ConverterOutput, format: OutputFormat): string | null {
  if (output.kind === "dataUri") return formatDataUri(output.dataUri, format);
  if (output.kind === "svg") return output.svg;
  return null;
}

function previewKey(output: ConverterOutput | null): string {
  if (!output) return "empty";
  if (output.kind === "dataUri") return output.dataUri.slice(-64) + output.dataUri.length;
  return output.previewUri.slice(-64) + output.previewUri.length;
}

type Dimensions = { width: number; height: number };

/**
 * Shows the result as an image. User content is only ever rendered through
 * `<img>` (data URI, or a blob URL for raster images), never inline, so
 * scripts and external references inside an SVG cannot run or load.
 */
function Preview({
  output,
  title,
  empty,
  alt,
  children,
}: {
  output: ConverterOutput | null;
  title: string;
  empty: string;
  alt: string;
  children: (dimensions: Dimensions | null) => ReactNode;
}) {
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const onLoad = (image: HTMLImageElement) => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    }
  };

  let image: ReactNode = null;
  if (output) {
    const className = "max-h-80 max-w-full object-contain";
    if (output.kind === "image" && output.mime !== "image/svg+xml") {
      image = (
        <BlobImage
          bytes={output.bytes}
          mime={output.mime}
          alt={alt}
          className={className}
          onLoad={onLoad}
        />
      );
    } else {
      const src = output.kind === "dataUri" ? output.dataUri : output.previewUri;
      image = (
        // Data URIs cannot go through next/image; <img> keeps SVG inert.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={className}
          onLoad={(event) => onLoad(event.currentTarget)}
        />
      );
    }
  }

  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div
        className={cn(
          "flex min-h-48 items-center justify-center rounded-card border border-border p-4",
          "bg-[conic-gradient(var(--muted)_25%,var(--background)_0_50%,var(--muted)_0_75%,var(--background)_0)] bg-[length:20px_20px]",
        )}
      >
        {image ?? (
          <p className="rounded-control bg-background px-3 py-1 text-sm text-muted-foreground">
            {empty}
          </p>
        )}
      </div>
      {children(dimensions)}
    </section>
  );
}

/** Raster image from bytes through a short-lived blob URL that is revoked on change or unmount. */
function BlobImage({
  bytes,
  mime,
  alt,
  className,
  onLoad,
}: {
  bytes: Uint8Array;
  mime: string;
  alt: string;
  className: string;
  onLoad: (image: HTMLImageElement) => void;
}) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [bytes, mime]);
  return (
    // Blob URLs cannot go through next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      alt={alt}
      className={className}
      onLoad={(event) => onLoad(event.currentTarget)}
    />
  );
}
