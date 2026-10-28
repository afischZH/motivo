/**
 * Share links (M1-AP06): a design `{ toolId, params, seed, size }` packed
 * into a short, URL-safe string for the URL hash, so designs can be shared
 * without an account.
 *
 * Wire format v1, base64url without padding:
 *   byte 0      format version (1)
 *   bytes 1..   raw DEFLATE of UTF-8 JSON `[toolId, toolVersion, seed, width, height, params]`
 *
 * Decoding treats the input as hostile: length limits before and after
 * decompression, strict JSON shape, and full validation through the tool's
 * zod schema and the shared seed/size schemas. It never throws.
 *
 * Params a tool derives from a user image (`imageInput.derivedKeys`) are
 * reset to their defaults in both directions, so a link never carries
 * anything taken from the user's image.
 */
import {
  canvasSizeSchema,
  parseToolParams,
  registry as defaultRegistry,
  seedSchema,
  privateParamKeys,
  withoutDerivedParams,
  type AnyToolDefinition,
  type ToolRegistry,
} from "@musterli/tool-registry";
import { deflateSync, inflateSync } from "fflate";
import type { Design, ParamValues } from "../store/editor-store";

export const SHARE_FORMAT_VERSION = 1;
/** Longest accepted encoded string. Real designs are a few hundred characters. */
export const SHARE_MAX_ENCODED_LENGTH = 8 * 1024;
/** Largest accepted JSON after decompression (guards against deflate bombs). */
export const SHARE_MAX_DECODED_BYTES = 64 * 1024;
/** Hash parameter that carries the design: `#d=<code>`. */
export const SHARE_HASH_PARAM = "d";

export type ShareDecodeError =
  | "empty"
  | "too-long"
  | "malformed"
  | "unsupported-version"
  | "unknown-tool"
  | "invalid-params"
  | "invalid-seed"
  | "invalid-size";

export type ShareEncodeError =
  "unknown-tool" | "invalid-params" | "invalid-seed" | "invalid-size" | "too-long";

export type ShareDecodeResult =
  | {
      ok: true;
      design: Design;
      /** Tool version the link was made with. */
      toolVersion: number;
      /** The tool changed since (`toolVersion !== tool.version`); output may differ slightly. */
      outdated: boolean;
    }
  | { ok: false; error: ShareDecodeError };

export type ShareEncodeResult =
  { ok: true; value: string } | { ok: false; error: ShareEncodeError };

type Lookup = Pick<ToolRegistry, "get">;

type ValidateResult =
  | { ok: true; tool: AnyToolDefinition; design: Design }
  | { ok: false; error: "unknown-tool" | "invalid-params" | "invalid-seed" | "invalid-size" };

function validate(
  registry: Lookup,
  toolId: string,
  params: unknown,
  seed: unknown,
  size: unknown,
): ValidateResult {
  const tool = registry.get(toolId);
  if (!tool) return { ok: false, error: "unknown-tool" };
  // Old param shapes (e.g. single-pattern links) are upgraded, then fully validated.
  const p = parseToolParams(tool, params);
  if (!p.success) return { ok: false, error: "invalid-params" };
  const s = seedSchema.safeParse(seed);
  if (!s.success) return { ok: false, error: "invalid-seed" };
  const z = canvasSizeSchema.safeParse(size);
  if (!z.success) return { ok: false, error: "invalid-size" };
  return {
    ok: true,
    tool,
    design: {
      toolId: tool.id,
      // Image-derived params describe the user's image: never in a link (privacy, size).
      params: withoutDerivedParams(tool, p.data as ParamValues),
      seed: s.data,
      size: z.data,
    },
  };
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Throws on invalid input (caught by the caller). */
function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Encode / decode
// ---------------------------------------------------------------------------

/** Packs a design. Validates it first, so every produced code decodes again. */
export function encodeDesign(
  design: Design,
  registry: Lookup = defaultRegistry,
): ShareEncodeResult {
  const v = validate(registry, design.toolId, design.params, design.seed, design.size);
  if (!v.ok) return v;
  const { design: d, tool } = v;
  // Private keys (uploads, image-derived values) are reset on decode anyway: leave them out.
  const hidden = new Set(privateParamKeys(tool));
  const params = Object.fromEntries(Object.entries(d.params).filter(([k]) => !hidden.has(k)));
  const json = JSON.stringify([
    d.toolId,
    tool.version,
    d.seed,
    d.size.width,
    d.size.height,
    params,
  ]);
  const raw = new TextEncoder().encode(json);
  if (raw.length > SHARE_MAX_DECODED_BYTES) return { ok: false, error: "too-long" };
  const deflated = deflateSync(raw, { level: 9, mem: 4 });
  const bytes = new Uint8Array(deflated.length + 1);
  bytes[0] = SHARE_FORMAT_VERSION;
  bytes.set(deflated, 1);
  const value = toBase64Url(bytes);
  if (value.length > SHARE_MAX_ENCODED_LENGTH) return { ok: false, error: "too-long" };
  return { ok: true, value };
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

function decodeUnsafe(input: unknown, registry: Lookup): ShareDecodeResult {
  if (typeof input !== "string") return { ok: false, error: "malformed" };
  const text = input.trim();
  if (text === "") return { ok: false, error: "empty" };
  if (text.length > SHARE_MAX_ENCODED_LENGTH) return { ok: false, error: "too-long" };
  if (!BASE64URL.test(text)) return { ok: false, error: "malformed" };

  const bytes = fromBase64Url(text);
  if (bytes.length < 2) return { ok: false, error: "malformed" };
  if (bytes[0] !== SHARE_FORMAT_VERSION) return { ok: false, error: "unsupported-version" };

  // One byte of headroom tells "exactly at the limit" from "truncated at the limit".
  const out = new Uint8Array(SHARE_MAX_DECODED_BYTES + 1);
  const raw = inflateSync(bytes.subarray(1), { out });
  if (raw.length > SHARE_MAX_DECODED_BYTES) return { ok: false, error: "too-long" };

  const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  if (!Array.isArray(json) || json.length !== 6) return { ok: false, error: "malformed" };
  const [toolId, toolVersion, seed, width, height, params] = json as unknown[];
  if (typeof toolId !== "string" || !isInt(toolVersion) || toolVersion < 1) {
    return { ok: false, error: "malformed" };
  }
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    return { ok: false, error: "invalid-params" };
  }
  const tool = registry.get(toolId);
  // Links leave private keys out (see `encodeDesign`): put the defaults back before validation.
  // A crafted link that carries them anyway gets the defaults too, whatever it put there:
  // never validated, never kept, and a bad value cannot make the whole link fail.
  const full: Record<string, unknown> = { ...(params as Record<string, unknown>) };
  if (tool) {
    const defaults = tool.defaults as Record<string, unknown>;
    for (const key of privateParamKeys(tool)) full[key] = defaults[key];
  }
  const v = validate(registry, toolId, full, seed, { width, height });
  if (!v.ok) return v;
  return { ok: true, design: v.design, toolVersion, outdated: toolVersion !== v.tool.version };
}

/** Unpacks and validates a design code. Never throws. */
export function decodeDesign(input: string, registry: Lookup = defaultRegistry): ShareDecodeResult {
  try {
    return decodeUnsafe(input, registry);
  } catch {
    // Invalid base64, corrupt deflate stream, invalid UTF-8 or JSON.
    return { ok: false, error: "malformed" };
  }
}

/** `#d=<code>` for `location.hash`. */
export function designToHash(
  design: Design,
  registry: Lookup = defaultRegistry,
): ShareEncodeResult {
  const r = encodeDesign(design, registry);
  return r.ok ? { ok: true, value: `#${SHARE_HASH_PARAM}=${r.value}` } : r;
}

/**
 * Reads the design from a URL hash (`#d=<code>`, other `&` parameters are
 * ignored). Returns `{ ok: false, error: "empty" }` when there is none.
 * Never throws.
 */
export function designFromHash(
  hash: string,
  registry: Lookup = defaultRegistry,
): ShareDecodeResult {
  if (typeof hash !== "string") return { ok: false, error: "malformed" };
  // Cheap guard before any parsing; the code itself is limited again in decodeDesign.
  if (hash.length > SHARE_MAX_ENCODED_LENGTH + 1024) return { ok: false, error: "too-long" };
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = `${SHARE_HASH_PARAM}=`;
  const part = body.split("&").find((p) => p.startsWith(prefix));
  if (part === undefined) return { ok: false, error: "empty" };
  return decodeDesign(part.slice(prefix.length), registry);
}
