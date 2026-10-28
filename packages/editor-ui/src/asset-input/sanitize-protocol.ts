/**
 * Messages between the editor and the SVG sanitize worker, plus the pure
 * handlers both sides use (the worker, and the main-thread fallback where
 * workers are missing). Plain data only; nothing of the file is evaluated.
 */
import { sanitizeSvg, type SvgRect } from "@motivo/svg-sanitizer";
import { prepareSvgAsset, type PreparedSvgAsset } from "@motivo/tool-registry/svg-asset";

/** A prepared asset without its two copies of the SVG (the reply carries it once). */
export type PreparedParts = Omit<PreparedSvgAsset, "input" | "svg">;

export type SvgReadOutcome =
  | { ok: true; svg: string; viewBox: SvgRect; removed: number }
  | { ok: false; error: "svg-invalid" | "svg-too-large" };

export type SvgCropOutcome =
  | {
      ok: true;
      svg: string;
      width: number;
      height: number;
      /** For `primeSvgAsset`; `null` if the output is not canonical (prepared on use). */
      prepared: PreparedParts | null;
    }
  | { ok: false; error: "svg-invalid" };

export type SanitizeWorkerRequest =
  | { id: number; type: "read"; bytes: ArrayBuffer; maxLength: number }
  | { id: number; type: "crop"; svg: string; crop: SvgRect; maxLength: number };

export type SanitizeWorkerResponse =
  ({ id: number; type: "read" } & SvgReadOutcome) | ({ id: number; type: "crop" } & SvgCropOutcome);

/** Decodes (strict UTF-8) and sanitises an uploaded SVG file. */
export function readSvg(bytes: Uint8Array, maxLength: number): SvgReadOutcome {
  if (bytes.length > maxLength) return { ok: false, error: "svg-too-large" };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: "svg-invalid" };
  }
  const clean = sanitizeSvg(text, { maxLength });
  if (!clean.ok) {
    return { ok: false, error: clean.error === "too-large" ? "svg-too-large" : "svg-invalid" };
  }
  return { ok: true, svg: clean.svg, viewBox: clean.viewBox, removed: clean.removed };
}

/** Crops sanitised SVG (new viewBox) and prepares the result for rendering. */
export function cropSvg(svg: string, crop: SvgRect, maxLength: number): SvgCropOutcome {
  const clean = sanitizeSvg(svg, { crop, maxLength });
  if (!clean.ok) return { ok: false, error: "svg-invalid" };
  const full = prepareSvgAsset(clean.svg);
  let prepared: PreparedParts | null = null;
  if (full && full.svg === clean.svg) {
    const { width, height, viewBox, recolorParts } = full;
    prepared = { width, height, viewBox, recolorParts };
  }
  return { ok: true, svg: clean.svg, width: clean.width, height: clean.height, prepared };
}

export function handleSanitizeRequest(request: SanitizeWorkerRequest): SanitizeWorkerResponse {
  if (request.type === "read") {
    return {
      id: request.id,
      type: "read",
      ...readSvg(new Uint8Array(request.bytes), request.maxLength),
    };
  }
  return {
    id: request.id,
    type: "crop",
    ...cropSvg(request.svg, request.crop, request.maxLength),
  };
}
