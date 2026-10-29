/**
 * The hand-over of a picture from one tool to another ("Weiterverwenden
 * in", docs/ARCHITECTURE.md 4.18). Kept in the memory of this tab only:
 * the source page puts the rendered picture here and navigates (client
 * side) to the target tool with `#handoff=<token>`; the target takes it
 * once. Nothing is written to disk, nothing reaches a server or a share
 * link, and closing or reloading the tab forgets it.
 *
 * Guards: one entry at a time (a newer hand-over replaces the older), a
 * random 128-bit token, the target tool must match, entries expire after
 * `HANDOFF_TTL_MS`, and the picture must be a raster image (by magic bytes)
 * of at most `IMAGE_INPUT_MAX_BYTES`. The target still runs it through the
 * full upload checks (`receive.ts`).
 */
import { IMAGE_INPUT_MAX_BYTES } from "../image-input/check";
import { sniffImageType } from "../image-input/sniff";

/** Hash parameter that carries the token. */
export const HANDOFF_HASH_PARAM = "handoff";
/** How long an untaken hand-over waits (navigation takes well under a second). */
export const HANDOFF_TTL_MS = 60_000;
/** 128 bits as 32 hex digits. */
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** Raster types a hand-over may carry (what the export produces). */
const HANDOFF_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface HandoffEntry {
  /** Tool the picture comes from (named in the confirmation). */
  readonly sourceToolId: string;
  /** Tool that must take it. */
  readonly toolId: string;
  /** Upload param of the target, `null` for the image picker of an `imageInput` tool. */
  readonly param: string | null;
  /** The picture (checked raster bytes). */
  readonly blob: Blob;
  /** File name shown in the upload field. */
  readonly name: string;
}

export type HandoffPutError = "too-large" | "unsupported-type" | "read-failed";

export interface HandoffStore {
  /** Checks and keeps `entry`; returns its one-time token. Replaces an older entry. */
  put(
    entry: HandoffEntry,
  ): Promise<{ ok: true; token: string } | { ok: false; error: HandoffPutError }>;
  /** The entry for `token` if it is for `toolId` and not expired; removed either way. */
  take(token: string, toolId: string): HandoffEntry | null;
  /** Forgets everything (tests). */
  clear(): void;
  /** Number of entries held (tests). */
  size(): number;
}

export interface HandoffStoreOptions {
  now?: () => number;
  randomToken?: () => string;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createHandoffStore(options: HandoffStoreOptions = {}): HandoffStore {
  const now = options.now ?? Date.now;
  const makeToken = options.randomToken ?? randomToken;
  const schedule = options.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const cancel =
    options.clearTimeout ??
    ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
  let current: { token: string; entry: HandoffEntry; expires: number } | null = null;
  let timer: unknown = null;

  const drop = () => {
    current = null;
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const pruneExpired = () => {
    if (current && now() >= current.expires) drop();
  };

  return {
    async put(entry) {
      pruneExpired();
      if (entry.blob.size > IMAGE_INPUT_MAX_BYTES) return { ok: false, error: "too-large" };
      let head: Uint8Array;
      try {
        head = new Uint8Array(await entry.blob.slice(0, 64).arrayBuffer());
      } catch {
        return { ok: false, error: "read-failed" };
      }
      const type = sniffImageType(head);
      if (type === null || !HANDOFF_TYPES.has(type))
        return { ok: false, error: "unsupported-type" };
      drop();
      const token = makeToken();
      current = { token, entry, expires: now() + HANDOFF_TTL_MS };
      // Orphans (the navigation never happened) leave memory on their own.
      timer = schedule(drop, HANDOFF_TTL_MS);
      return { ok: true, token };
    },

    take(token, toolId) {
      pruneExpired();
      if (!current || !TOKEN_PATTERN.test(token) || current.token !== token) return null;
      const { entry } = current;
      // One attempt only: a wrong tool gets nothing and nobody gets it afterwards.
      drop();
      return entry.toolId === toolId ? entry : null;
    },

    clear: drop,
    size: () => (current ? 1 : 0),
  };
}

/** The tab's hand-over store (module state survives client-side navigation). */
export const handoffStore: HandoffStore = createHandoffStore();

/** `#handoff=<token>` for the target URL. */
export function handoffHash(token: string): string {
  return `#${HANDOFF_HASH_PARAM}=${token}`;
}

/** The token in a URL hash, if any and well-formed. */
export function handoffTokenFromHash(hash: string): string | null {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = `${HANDOFF_HASH_PARAM}=`;
  const part = body.split("&").find((p) => p.startsWith(prefix));
  if (part === undefined) return null;
  const token = part.slice(prefix.length);
  return TOKEN_PATTERN.test(token) ? token : null;
}
