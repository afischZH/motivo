/**
 * One entry point for all converters with a uniform output shape, used by
 * the Web Worker and by the synchronous fallback.
 */
import {
  base64ToImage,
  base64ToSvg,
  cssToSvg,
  imageToBase64,
  type ConvertError,
  svgToBase64,
  svgToCss,
} from "./converters";
import type { ConverterId } from "./ids";
import type { ImageMime } from "./sniff";

export type ConverterInput = string | Uint8Array;

export type ConverterNote = "addedNamespace" | "multipleFound" | "typeMismatch";

export type ConverterOutput =
  /** Something was encoded into a data URI; the UI wraps it in the chosen format. */
  | { kind: "dataUri"; dataUri: string; mime: ImageMime; notes: ConverterNote[] }
  /** SVG markup was decoded; `previewUri` is a Base64 data URI for `<img>`. */
  | { kind: "svg"; svg: string; previewUri: string; found: number; notes: ConverterNote[] }
  /** An image file was decoded. */
  | {
      kind: "image";
      mime: ImageMime;
      extension: string;
      bytes: Uint8Array;
      previewUri: string;
      notes: ConverterNote[];
    };

export type ConverterResult =
  { ok: true; value: ConverterOutput } | { ok: false; error: ConvertError };

const asText = (input: ConverterInput) =>
  typeof input === "string" ? input : new TextDecoder().decode(input);

export function runConverter(id: ConverterId, input: ConverterInput): ConverterResult {
  switch (id) {
    // Encodes pixels, so it runs in its own worker (`image-convert.worker.ts`).
    case "image-converter":
      return { ok: false, error: "unsupportedType" };
    case "svg-to-css":
    case "svg-to-base64": {
      const result = (id === "svg-to-css" ? svgToCss : svgToBase64)(asText(input));
      if (!result.ok) return result;
      const notes: ConverterNote[] = result.value.addedNamespace ? ["addedNamespace"] : [];
      return {
        ok: true,
        value: { kind: "dataUri", dataUri: result.value.dataUri, mime: "image/svg+xml", notes },
      };
    }
    case "css-to-svg":
    case "base64-to-svg": {
      const result = (id === "css-to-svg" ? cssToSvg : base64ToSvg)(asText(input));
      if (!result.ok) return result;
      const { svg, dataUri, found } = result.value;
      const notes: ConverterNote[] = found > 1 ? ["multipleFound"] : [];
      return { ok: true, value: { kind: "svg", svg, previewUri: dataUri, found, notes } };
    }
    case "image-to-base64": {
      if (typeof input === "string") return { ok: false, error: "unsupportedType" };
      const result = imageToBase64(input);
      if (!result.ok) return result;
      return {
        ok: true,
        value: {
          kind: "dataUri",
          dataUri: result.value.dataUri,
          mime: result.value.mime,
          notes: [],
        },
      };
    }
    case "base64-to-image": {
      const result = base64ToImage(asText(input));
      if (!result.ok) return result;
      const { mime, extension, bytes, dataUri, typeMismatch } = result.value;
      const notes: ConverterNote[] = typeMismatch ? ["typeMismatch"] : [];
      return {
        ok: true,
        value: { kind: "image", mime, extension, bytes, previewUri: dataUri, notes },
      };
    }
  }
}
