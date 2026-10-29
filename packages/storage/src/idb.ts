/**
 * A very small IndexedDB layer without dependencies: opening with schema
 * upgrades, transactions as promises and error mapping. Results are read
 * when the transaction completes, so a write is only reported as done once
 * the browser committed it.
 */

export const DB_NAME = "motivo";
/** Bump with a new `upgrade` step; never change an existing step. */
export const DB_VERSION = 4;

export const STORE = {
  designs: "designs",
  designParams: "design-params",
  drafts: "drafts",
  meta: "meta",
  /** Version 2 (M3-AP05): the brand kit's palettes. */
  brandPalettes: "brand-palettes",
  /** Version 2: brand kit logos and own shapes (sanitised SVG or re-encoded raster). */
  brandAssets: "brand-assets",
  /** Version 3 (M6-AP02): overview rows of social editor designs (with thumbnail). */
  socialDesigns: "social-designs",
  /** Version 3: the scene of each social design, apart from the overview (uploads can be large). */
  socialScenes: "social-scenes",
  /** Version 3: the social editor's autosave draft. */
  socialDrafts: "social-drafts",
  /** Version 4 (M6-AP03): the brand kit's own fonts (file bytes, at most 10). */
  brandFonts: "brand-fonts",
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

/**
 * `unavailable`: no IndexedDB (private mode in some browsers, blocked site
 * data, very old browsers); `quota`: the browser refused more data;
 * `blocked`: another tab holds an older version open; `not-found`: the
 * record does not exist (any more); `limit`: a brand kit list is full;
 * `failed`: anything else.
 */
export type StorageErrorCode =
  "unavailable" | "quota" | "blocked" | "not-found" | "limit" | "failed";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
  }
}

/** Maps a DOMException (or anything thrown) to a `StorageError`. */
export function toStorageError(
  error: unknown,
  fallback: StorageErrorCode = "failed",
): StorageError {
  if (error instanceof StorageError) return error;
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "QuotaExceededError") {
    return new StorageError("quota", "The browser refused to store more data", { cause: error });
  }
  if (name === "SecurityError" || name === "InvalidStateError") {
    return new StorageError("unavailable", "IndexedDB is not available here", { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new StorageError(fallback, message || "IndexedDB request failed", { cause: error });
}

/**
 * Creates the object stores step by step. `oldVersion` 0 means a fresh
 * database; an existing one only runs the steps it lacks, so its data stays.
 */
function upgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore(STORE.designs, { keyPath: "id" });
    db.createObjectStore(STORE.designParams, { keyPath: "id" });
    db.createObjectStore(STORE.drafts, { keyPath: "toolId" });
    db.createObjectStore(STORE.meta, { keyPath: "key" });
  }
  if (oldVersion < 2) {
    db.createObjectStore(STORE.brandPalettes, { keyPath: "id" });
    db.createObjectStore(STORE.brandAssets, { keyPath: "id" });
  }
  if (oldVersion < 3) {
    db.createObjectStore(STORE.socialDesigns, { keyPath: "id" });
    db.createObjectStore(STORE.socialScenes, { keyPath: "id" });
    db.createObjectStore(STORE.socialDrafts, { keyPath: "id" });
  }
  if (oldVersion < 4) {
    db.createObjectStore(STORE.brandFonts, { keyPath: "id" });
  }
}

/** How long to wait for other tabs to release an old version. */
const BLOCKED_TIMEOUT_MS = 10_000;

/** Opens (and if needed creates or upgrades) the database. */
export function openDatabase(factory: IDBFactory, name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DB_VERSION);
    } catch (error) {
      reject(toStorageError(error, "unavailable"));
      return;
    }
    let blockedTimer: ReturnType<typeof setTimeout> | undefined;
    request.onupgradeneeded = (event) => {
      upgrade(request.result, event.oldVersion);
    };
    request.onblocked = () => {
      blockedTimer ??= setTimeout(
        () => reject(new StorageError("blocked", "Another tab keeps an older version open")),
        BLOCKED_TIMEOUT_MS,
      );
    };
    request.onsuccess = () => {
      clearTimeout(blockedTimer);
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(blockedTimer);
      // Firefox in some private modes and Safari with blocked site data fail here.
      reject(toStorageError(request.error, "unavailable"));
    };
  });
}

/**
 * Runs `body` in one transaction. `body` issues requests and returns a
 * function that reads the outcome; it is called once the transaction has
 * committed. Any request error aborts the whole transaction (all or nothing).
 */
export function transact<T>(
  db: IDBDatabase,
  stores: StoreName | readonly StoreName[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => () => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores as string | string[], mode);
    } catch (error) {
      reject(toStorageError(error));
      return;
    }
    let read: () => T;
    try {
      read = body(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Already finished.
      }
      reject(toStorageError(error));
      return;
    }
    tx.oncomplete = () => {
      try {
        resolve(read());
      } catch (error) {
        reject(toStorageError(error));
      }
    };
    // A failed request aborts the transaction (no preventDefault), reported once here.
    tx.onabort = () => {
      reject(toStorageError(tx.error ?? new DOMException("Transaction aborted", "AbortError")));
    };
  });
}

/** The `indexedDB` of this realm, or `undefined` (access itself can throw). */
export function defaultFactory(): IDBFactory | undefined {
  try {
    return typeof indexedDB === "undefined" ? undefined : indexedDB;
  } catch {
    return undefined;
  }
}
