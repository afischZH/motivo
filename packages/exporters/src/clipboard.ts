/**
 * Clipboard helpers with feature detection. Browser globals are only read
 * when a function is called.
 */

export type ClipboardResult =
  | { ok: true }
  | {
      ok: false;
      /** `unsupported`: API missing; `denied`: no permission or no user gesture; `failed`: other. */
      reason: "unsupported" | "denied" | "failed";
      error?: unknown;
    };

interface ClipboardLike {
  writeText?(text: string): Promise<void>;
  write?(items: ClipboardItem[]): Promise<void>;
}

function clipboard(): ClipboardLike | undefined {
  const nav = (globalThis as { navigator?: { clipboard?: ClipboardLike } }).navigator;
  return nav?.clipboard;
}

type ClipboardItemCtor = (new (items: Record<string, Blob | Promise<Blob>>) => ClipboardItem) & {
  supports?(type: string): boolean;
};

function clipboardItem(): ClipboardItemCtor | undefined {
  const ctor = (globalThis as { ClipboardItem?: ClipboardItemCtor }).ClipboardItem;
  return typeof ctor === "function" ? ctor : undefined;
}

function failure(error: unknown): ClipboardResult {
  const name = (error as { name?: unknown } | null)?.name;
  return { ok: false, reason: name === "NotAllowedError" ? "denied" : "failed", error };
}

export function canCopyText(): boolean {
  return typeof clipboard()?.writeText === "function";
}

/** Whether PNG images can be written (ClipboardItem plus `clipboard.write`). */
export function canCopyImage(): boolean {
  const Item = clipboardItem();
  if (!Item || typeof clipboard()?.write !== "function") return false;
  return typeof Item.supports === "function" ? Item.supports("image/png") : true;
}

/** Copies text (code exports, share links). Must run in a user gesture in some browsers. */
export async function copyText(text: string): Promise<ClipboardResult> {
  const cb = clipboard();
  if (typeof cb?.writeText !== "function") return { ok: false, reason: "unsupported" };
  try {
    await cb.writeText(text);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Copies a PNG. Pass the Blob as a promise while it is still being encoded:
 * Safari only allows the write if the `ClipboardItem` is created
 * synchronously inside the user gesture, which this function does before
 * its first `await`. Only `image/png` is reliably supported across browsers.
 */
export async function copyPng(png: Blob | Promise<Blob>): Promise<ClipboardResult> {
  const cb = clipboard();
  const Item = clipboardItem();
  if (!Item || typeof cb?.write !== "function") return { ok: false, reason: "unsupported" };
  const blob = Promise.resolve(png).then((b) => {
    if (b.type !== "image/png") throw new TypeError(`Expected image/png, got ${b.type}`);
    return b;
  });
  // The rejection is reported through `write`; avoid an extra unhandled rejection.
  blob.catch(() => undefined);
  try {
    await cb.write([new Item({ "image/png": blob })]);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
