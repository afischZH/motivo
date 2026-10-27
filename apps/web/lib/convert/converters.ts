/**
 * The six converters as pure functions. They never touch the DOM, never
 * fetch anything and never evaluate input; the UI only renders their output
 * as text or through `<img>`.
 */
import {
  base64ToBytes,
  bytesToBase64,
  percentEncodeForDataUri,
  utf8ByteLength,
  utf8Decode,
  utf8Encode,
} from "./bytes";
import { extractDataUris, parseDataUri } from "./data-uri";
import {
  IMAGE_EXTENSIONS,
  IMAGE_TYPES,
  type ImageMime,
  looksLikeSvg,
  sniffImageType,
  stripProlog,
} from "./sniff";

/** Upper bound for any input: SVG text, decoded Base64 payload or image file. */
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

/** Base64 grows by 4/3; allow some room for a data URI prefix, CSS and line breaks. */
const MAX_ENCODED_CHARS = Math.ceil((MAX_INPUT_BYTES * 4) / 3) + 64 * 1024;

export type ConvertError =
  | "empty"
  | "tooLarge"
  | "notSvg"
  | "invalidBase64"
  | "invalidDataUri"
  | "noDataUri"
  | "unsupportedType"
  | "notAnImage";

export type Result<T> = { ok: true; value: T } | { ok: false; error: ConvertError };

const fail = (error: ConvertError): { ok: false; error: ConvertError } => ({ ok: false, error });

const BOM_PATTERN = new RegExp("^" + String.fromCharCode(0xfeff));
const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';

export type PreparedSvg = { svg: string; addedNamespace: boolean };

/**
 * Validates SVG text and makes it usable in a data URI: strips a BOM and adds
 * the SVG namespace to the root element if it is missing (without it, browsers
 * refuse to render the SVG as an image).
 */
export function prepareSvg(
  input: string,
  { collapseWhitespace = false } = {},
): Result<PreparedSvg> {
  if (utf8ByteLength(input) > MAX_INPUT_BYTES) return fail("tooLarge");
  let svg = input.replace(BOM_PATTERN, "").trim();
  if (svg === "") return fail("empty");
  if (!looksLikeSvg(svg)) return fail("notSvg");

  let addedNamespace = false;
  const body = stripProlog(svg);
  const prolog = svg.slice(0, svg.length - body.length);
  const rootTag = /^<svg[^>]*>/.exec(body)?.[0];
  if (rootTag !== undefined && !/\sxmlns\s*=/.test(rootTag)) {
    svg = `${prolog}<svg ${SVG_NS}${body.slice(4)}`;
    addedNamespace = true;
  }
  // XML collapses whitespace in SVG text by default, so this is lossless for
  // rendering and makes the CSS noticeably shorter.
  if (collapseWhitespace) svg = svg.replace(/\s+/g, " ");
  return { ok: true, value: { svg, addedNamespace } };
}

export type EncodedSvg = { dataUri: string; base64?: string; addedNamespace: boolean };

/** SVG to a URL-encoded data URI (compact and still readable in CSS). */
export function svgToCss(input: string): Result<EncodedSvg> {
  const prepared = prepareSvg(input, { collapseWhitespace: true });
  if (!prepared.ok) return prepared;
  const { svg, addedNamespace } = prepared.value;
  return {
    ok: true,
    value: { dataUri: `data:image/svg+xml,${percentEncodeForDataUri(svg)}`, addedNamespace },
  };
}

/** SVG to a Base64 data URI. The markup is kept as is, apart from the namespace fix. */
export function svgToBase64(input: string): Result<EncodedSvg> {
  const prepared = prepareSvg(input);
  if (!prepared.ok) return prepared;
  const { svg, addedNamespace } = prepared.value;
  const base64 = bytesToBase64(utf8Encode(svg));
  return {
    ok: true,
    value: { dataUri: `data:image/svg+xml;base64,${base64}`, base64, addedNamespace },
  };
}

export type DecodedSvg = { svg: string; dataUri: string; found: number };

function decodeSvgBytes(bytes: Uint8Array): Result<string> {
  if (bytes.length > MAX_INPUT_BYTES) return fail("tooLarge");
  const text = utf8Decode(bytes);
  if (text === null || !looksLikeSvg(text)) return fail("notSvg");
  return { ok: true, value: text.trim() };
}

/** Extracts the first SVG data URI from CSS (or HTML) and decodes it. */
export function cssToSvg(input: string): Result<DecodedSvg> {
  if (input.length > MAX_ENCODED_CHARS * 3) return fail("tooLarge");
  if (input.trim() === "") return fail("empty");
  const uris = extractDataUris(input);
  if (uris.length === 0) return fail("noDataUri");

  let firstError: ConvertError | null = null;
  for (const uri of uris) {
    const parsed = parseDataUri(uri);
    if (!parsed.ok) {
      firstError ??= parsed.error;
      continue;
    }
    if (parsed.value.mime !== "image/svg+xml") {
      firstError ??= "unsupportedType";
      continue;
    }
    const svg = decodeSvgBytes(parsed.value.bytes);
    if (!svg.ok) {
      firstError ??= svg.error;
      continue;
    }
    return {
      ok: true,
      value: {
        svg: svg.value,
        dataUri: toBase64DataUri("image/svg+xml", parsed.value.bytes),
        found: uris.length,
      },
    };
  }
  return fail(firstError ?? "noDataUri");
}

type DecodedPayload = { bytes: Uint8Array; declaredMime: string | null };

/**
 * Reads Base64 input in any common wrapping: raw Base64, a data URI, or a
 * data URI inside CSS `url()` or an HTML attribute.
 */
function decodeBase64Input(input: string): Result<DecodedPayload> {
  if (input.length > MAX_ENCODED_CHARS) return fail("tooLarge");
  const text = input.trim();
  if (text === "") return fail("empty");

  let bytes: Uint8Array;
  let declaredMime: string | null = null;
  if (/data:/i.test(text)) {
    const uri = /^data:/i.test(text) ? text : extractDataUris(text)[0];
    if (uri === undefined) return fail("invalidDataUri");
    const parsed = parseDataUri(uri);
    if (!parsed.ok) return parsed;
    bytes = parsed.value.bytes;
    declaredMime = parsed.value.mime;
  } else {
    const decoded = base64ToBytes(text);
    if (decoded === null) return fail("invalidBase64");
    bytes = decoded;
  }
  if (bytes.length === 0) return fail("empty");
  if (bytes.length > MAX_INPUT_BYTES) return fail("tooLarge");
  return { ok: true, value: { bytes, declaredMime } };
}

const isImageMime = (mime: string): mime is ImageMime =>
  (IMAGE_TYPES as readonly string[]).includes(mime);

/** Base64 (raw or data URI) to SVG markup. */
export function base64ToSvg(input: string): Result<DecodedSvg> {
  const decoded = decodeBase64Input(input);
  if (!decoded.ok) return decoded;
  const { bytes, declaredMime } = decoded.value;
  if (declaredMime !== null && !isImageMime(declaredMime)) return fail("unsupportedType");
  const svg = decodeSvgBytes(bytes);
  if (!svg.ok) return svg;
  return {
    ok: true,
    value: { svg: svg.value, dataUri: toBase64DataUri("image/svg+xml", bytes), found: 1 },
  };
}

export type DecodedImage = {
  mime: ImageMime;
  extension: string;
  bytes: Uint8Array;
  /** Base64 data URI with the sniffed type, safe to use as `<img src>`. */
  dataUri: string;
  /** The data URI declared another (allowed) image type than the content has. */
  typeMismatch: boolean;
};

/** Base64 (raw or data URI) to an image file. Only allowlisted image types pass. */
export function base64ToImage(input: string): Result<DecodedImage> {
  const decoded = decodeBase64Input(input);
  if (!decoded.ok) return decoded;
  const { bytes, declaredMime } = decoded.value;
  if (declaredMime !== null && !isImageMime(declaredMime)) return fail("unsupportedType");
  const mime = sniffImageType(bytes);
  if (mime === null) return fail("notAnImage");
  return {
    ok: true,
    value: {
      mime,
      extension: IMAGE_EXTENSIONS[mime],
      bytes,
      dataUri: toBase64DataUri(mime, bytes),
      typeMismatch: declaredMime !== null && declaredMime !== mime,
    },
  };
}

export type EncodedImage = { mime: ImageMime; base64: string; dataUri: string };

/** Image file bytes to Base64. The type comes from the content, not the file name. */
export function imageToBase64(bytes: Uint8Array): Result<EncodedImage> {
  if (bytes.length === 0) return fail("empty");
  if (bytes.length > MAX_INPUT_BYTES) return fail("tooLarge");
  const mime = sniffImageType(bytes);
  if (mime === null) return fail("unsupportedType");
  const base64 = bytesToBase64(bytes);
  return { ok: true, value: { mime, base64, dataUri: `data:${mime};base64,${base64}` } };
}

export function toBase64DataUri(mime: ImageMime, bytes: Uint8Array): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

export const OUTPUT_FORMATS = ["css", "dataUri", "base64", "html"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** Wraps a data URI as CSS, HTML or returns it (or its Base64 part) bare. */
export function formatDataUri(dataUri: string, format: OutputFormat): string {
  switch (format) {
    case "css":
      return `background-image: url("${dataUri}");`;
    case "html":
      return `<img src="${dataUri}" alt="">`;
    case "base64": {
      const comma = dataUri.indexOf(",");
      return /;base64$/i.test(dataUri.slice(0, comma)) ? dataUri.slice(comma + 1) : dataUri;
    }
    case "dataUri":
      return dataUri;
  }
}
