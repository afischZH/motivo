/**
 * Saved designs and autosave drafts in IndexedDB (M3-AP03). Everything stays
 * in this browser; moving designs to another device goes through a file
 * (export/import, see `@musterli/editor-ui` designs transfer).
 *
 * Layout (database `motivo`, see idb.ts):
 *  - `designs`: id, tool, name, seed, size, timestamps, thumbnail. Enough
 *    for the "Meine Designs" grid, so listing never loads params.
 *  - `design-params`: id to params. Kept apart because uploads
 *    (`localParams`) can make params megabytes large.
 *  - `drafts`: the last editor state per tool (debounced autosave).
 *  - `meta`: small flags, e.g. whether persistence was requested.
 *
 * Thumbnails are stored as `ArrayBuffer` plus type instead of a `Blob`:
 * older Safari versions failed to store blobs in IndexedDB.
 */
import { createConnection, randomHexId } from "./connection";
import { STORE, StorageError, toStorageError, transact } from "./idb";
import {
  DESIGN_NAME_MAX,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_TYPES,
  storedDesignSchema,
  storedDraftSchema,
  storedParamsSchema,
  type DesignSize,
  type StoredDesign,
  type StoredDraft,
} from "./schema";

/** What the overview shows of a design. */
export interface DesignSummary {
  id: string;
  toolId: string;
  toolVersion: number;
  name: string;
  seed: number;
  size: DesignSize;
  createdAt: number;
  updatedAt: number;
  /** About 400 px WebP (PNG where the browser cannot encode WebP); `null` until rendered. */
  thumbnail: Blob | null;
}

/** A complete saved design. */
export interface DesignRecord extends DesignSummary {
  params: Record<string, unknown>;
}

/** What the editor hands over when saving. */
export interface DesignInput {
  toolId: string;
  toolVersion: number;
  name: string;
  params: Record<string, unknown>;
  seed: number;
  size: DesignSize;
  thumbnail?: Blob | null;
}

/** A design from an import file: own id and timestamps, no thumbnail. */
export interface ImportedDesign {
  id: string;
  toolId: string;
  toolVersion: number;
  name: string;
  params: Record<string, unknown>;
  seed: number;
  size: DesignSize;
  createdAt: number;
  updatedAt: number;
}

export interface ImportOutcome {
  /** Ids of the designs added (new ids where the file's id was taken). */
  added: string[];
  /** Designs skipped because the very same version is already stored. */
  duplicates: number;
}

export type Draft = StoredDraft;

export interface DesignStore {
  /** All designs, most recently changed first. Broken records are left out. */
  list(): Promise<DesignSummary[]>;
  /** One design with params, or `null`. */
  get(id: string): Promise<DesignRecord | null>;
  /** Every design with params (file export). */
  getAll(): Promise<DesignRecord[]>;
  create(input: DesignInput): Promise<DesignRecord>;
  /** Replaces content and name; keeps id and `createdAt`. Throws `not-found`. */
  update(id: string, input: DesignInput): Promise<DesignRecord>;
  rename(id: string, name: string): Promise<void>;
  /** Copies a design under a new id and name (thumbnail included). */
  duplicate(id: string, name: string): Promise<DesignRecord>;
  remove(id: string): Promise<void>;
  /** Puts a removed design back unchanged (undo). */
  restore(record: DesignRecord): Promise<void>;
  setThumbnail(id: string, thumbnail: Blob | null): Promise<void>;
  /** Adds validated designs in one transaction (all or nothing). */
  importDesigns(designs: readonly ImportedDesign[]): Promise<ImportOutcome>;
  getDraft(toolId: string): Promise<Draft | null>;
  putDraft(draft: Draft): Promise<void>;
  deleteDraft(toolId: string): Promise<void>;
  /**
   * Asks the browser once (per browser profile) to keep our data even under
   * storage pressure. Returns the browser's answer, or `null` when it was
   * asked before or cannot be asked.
   */
  requestPersistence(): Promise<boolean | null>;
  close(): void;
}

export interface DesignStoreOptions {
  /** Default: the global `indexedDB`. */
  indexedDB?: IDBFactory;
  /** Database name; tests use their own. Default `motivo`. */
  databaseName?: string;
  now?: () => number;
  /** New design ids. Default: 128 random bits as hex. */
  randomId?: () => string;
  /** `navigator.storage.persist`; default the browser's when present. */
  persist?: () => Promise<boolean>;
}

const PERSIST_KEY = "persist-requested";

function browserPersist(): (() => Promise<boolean>) | undefined {
  const storage = (globalThis as { navigator?: { storage?: StorageManager } }).navigator?.storage;
  return typeof storage?.persist === "function" ? () => storage.persist() : undefined;
}

/** Trimmed, at most `DESIGN_NAME_MAX` characters, without control characters. */
export function normalizeDesignName(name: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, " ");
  return clean.trim().slice(0, DESIGN_NAME_MAX).trim();
}

type StoredThumbnail = StoredDesign["thumbnail"];
type ThumbnailType = (typeof THUMBNAIL_TYPES)[number];

const isThumbnailType = (type: string): type is ThumbnailType =>
  (THUMBNAIL_TYPES as readonly string[]).includes(type);

/** A thumbnail blob as stored (`null` when missing, too large or of another type). */
export async function toStoredThumbnail(blob: Blob | null | undefined): Promise<StoredThumbnail> {
  if (!blob || blob.size === 0 || blob.size > THUMBNAIL_MAX_BYTES) return null;
  if (!isThumbnailType(blob.type)) return null;
  return { type: blob.type, bytes: await blob.arrayBuffer() };
}

function toSummary(row: StoredDesign): DesignSummary {
  const { thumbnail, ...rest } = row;
  return {
    ...rest,
    size: { ...row.size },
    thumbnail: thumbnail ? new Blob([thumbnail.bytes], { type: thumbnail.type }) : null,
  };
}

function parseDesign(value: unknown): StoredDesign | null {
  const parsed = storedDesignSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseParams(value: unknown): Record<string, unknown> | null {
  const parsed = storedParamsSchema.safeParse(value);
  return parsed.success ? parsed.data.params : null;
}

export function createDesignStore(options: DesignStoreOptions = {}): DesignStore {
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? randomHexId;
  const persist = options.persist ?? browserPersist();
  const connection = createConnection(options);
  const db = connection.db;

  const getRecord = async (id: string): Promise<DesignRecord | null> => {
    const database = await db();
    return transact(database, [STORE.designs, STORE.designParams], "readonly", (tx) => {
      const row = tx.objectStore(STORE.designs).get(id);
      const params = tx.objectStore(STORE.designParams).get(id);
      return () => {
        const design = parseDesign(row.result);
        const p = parseParams(params.result);
        return design && p ? { ...toSummary(design), params: p } : null;
      };
    });
  };

  /** Writes a design row and its params in one transaction. */
  const write = async (row: StoredDesign, params: Record<string, unknown>): Promise<void> => {
    const database = await db();
    await transact(database, [STORE.designs, STORE.designParams], "readwrite", (tx) => {
      tx.objectStore(STORE.designs).put(row);
      tx.objectStore(STORE.designParams).put({ id: row.id, params });
      return () => undefined;
    });
  };

  const validRow = (row: StoredDesign): StoredDesign => {
    const parsed = storedDesignSchema.safeParse(row);
    if (!parsed.success)
      throw new StorageError("failed", `Invalid design: ${parsed.error.message}`);
    return row;
  };

  const validParams = (params: Record<string, unknown>): Record<string, unknown> => {
    if (!storedParamsSchema.safeParse({ id: "x", params }).success) {
      throw new StorageError("failed", "Params must be a plain object");
    }
    return params;
  };

  /** Applies `change` to a stored row inside one readwrite transaction. */
  const patchRow = async (id: string, change: (row: StoredDesign) => StoredDesign) => {
    const database = await db();
    const found = await transact(database, STORE.designs, "readwrite", (tx) => {
      const store = tx.objectStore(STORE.designs);
      const request = store.get(id);
      let ok = false;
      request.onsuccess = () => {
        const row = parseDesign(request.result);
        if (!row) return;
        ok = true;
        store.put(validRow(change(row)));
      };
      return () => ok;
    });
    if (!found) throw new StorageError("not-found", `No design ${id}`);
  };

  const create = async (input: DesignInput): Promise<DesignRecord> => {
    const t = now();
    const row = validRow({
      id: randomId(),
      toolId: input.toolId,
      toolVersion: input.toolVersion,
      name: normalizeDesignName(input.name),
      seed: input.seed,
      size: { width: input.size.width, height: input.size.height },
      createdAt: t,
      updatedAt: t,
      thumbnail: await toStoredThumbnail(input.thumbnail),
    });
    await write(row, validParams(input.params));
    return { ...toSummary(row), params: input.params };
  };

  return {
    async list() {
      const database = await db();
      return transact(database, STORE.designs, "readonly", (tx) => {
        const request = tx.objectStore(STORE.designs).getAll();
        return () =>
          (request.result as unknown[])
            .map(parseDesign)
            .filter((row): row is StoredDesign => row !== null)
            .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name))
            .map(toSummary);
      });
    },

    get: getRecord,

    async getAll() {
      const database = await db();
      return transact(database, [STORE.designs, STORE.designParams], "readonly", (tx) => {
        const rows = tx.objectStore(STORE.designs).getAll();
        const params = tx.objectStore(STORE.designParams).getAll();
        return () => {
          const byId = new Map<string, Record<string, unknown>>();
          for (const value of params.result as unknown[]) {
            const parsed = storedParamsSchema.safeParse(value);
            if (parsed.success) byId.set(parsed.data.id, parsed.data.params);
          }
          const out: DesignRecord[] = [];
          for (const value of rows.result as unknown[]) {
            const row = parseDesign(value);
            const p = row ? byId.get(row.id) : undefined;
            if (row && p) out.push({ ...toSummary(row), params: p });
          }
          return out.sort((a, b) => b.updatedAt - a.updatedAt);
        };
      });
    },

    create,

    async update(id, input) {
      const existing = await getRecord(id);
      if (!existing) throw new StorageError("not-found", `No design ${id}`);
      const row = validRow({
        id,
        toolId: input.toolId,
        toolVersion: input.toolVersion,
        name: normalizeDesignName(input.name),
        seed: input.seed,
        size: { width: input.size.width, height: input.size.height },
        createdAt: existing.createdAt,
        // Never earlier than before, even if the clock went back.
        updatedAt: Math.max(now(), existing.updatedAt),
        thumbnail:
          input.thumbnail === undefined
            ? await toStoredThumbnail(existing.thumbnail)
            : await toStoredThumbnail(input.thumbnail),
      });
      await write(row, validParams(input.params));
      return { ...toSummary(row), params: input.params };
    },

    async rename(id, name) {
      const clean = normalizeDesignName(name);
      await patchRow(id, (row) => ({
        ...row,
        name: clean,
        updatedAt: Math.max(now(), row.updatedAt),
      }));
    },

    async duplicate(id, name) {
      const source = await getRecord(id);
      if (!source) throw new StorageError("not-found", `No design ${id}`);
      return create({
        toolId: source.toolId,
        toolVersion: source.toolVersion,
        name,
        params: source.params,
        seed: source.seed,
        size: source.size,
        thumbnail: source.thumbnail,
      });
    },

    async remove(id) {
      const database = await db();
      await transact(database, [STORE.designs, STORE.designParams], "readwrite", (tx) => {
        tx.objectStore(STORE.designs).delete(id);
        tx.objectStore(STORE.designParams).delete(id);
        return () => undefined;
      });
    },

    async restore(record) {
      const { params, thumbnail, ...rest } = record;
      const row = validRow({
        ...rest,
        size: { ...rest.size },
        thumbnail: await toStoredThumbnail(thumbnail),
      });
      await write(row, validParams(params));
    },

    async setThumbnail(id, thumbnail) {
      const stored = await toStoredThumbnail(thumbnail);
      // Not a content change: `updatedAt` stays, so the order in the overview does too.
      await patchRow(id, (row) => ({ ...row, thumbnail: stored }));
    },

    async importDesigns(designs) {
      const database = await db();
      const t = now();
      return transact(database, [STORE.designs, STORE.designParams], "readwrite", (tx) => {
        const rows = tx.objectStore(STORE.designs);
        const paramsStore = tx.objectStore(STORE.designParams);
        const added: string[] = [];
        let duplicates = 0;
        const request = rows.getAll();
        request.onsuccess = () => {
          const existing = new Map<string, StoredDesign>();
          for (const value of request.result as unknown[]) {
            const row = parseDesign(value);
            if (row) existing.set(row.id, row);
          }
          for (const design of designs) {
            const same = existing.get(design.id);
            if (
              same &&
              same.toolId === design.toolId &&
              same.updatedAt === design.updatedAt &&
              same.seed === design.seed
            ) {
              duplicates++;
              continue;
            }
            // Another design (or another version of it) has this id: keep both.
            let id = design.id;
            while (existing.has(id)) id = randomId();
            const row = validRow({
              id,
              toolId: design.toolId,
              toolVersion: design.toolVersion,
              name: normalizeDesignName(design.name),
              seed: design.seed,
              size: { width: design.size.width, height: design.size.height },
              createdAt: Math.min(design.createdAt, t),
              updatedAt: Math.min(design.updatedAt, t),
              thumbnail: null,
            });
            existing.set(id, row);
            rows.put(row);
            paramsStore.put({ id, params: validParams(design.params) });
            added.push(id);
          }
        };
        return () => ({ added, duplicates });
      });
    },

    async getDraft(toolId) {
      const database = await db();
      return transact(database, STORE.drafts, "readonly", (tx) => {
        const request = tx.objectStore(STORE.drafts).get(toolId);
        return () => {
          const parsed = storedDraftSchema.safeParse(request.result);
          return parsed.success ? parsed.data : null;
        };
      });
    },

    async putDraft(draft) {
      const parsed = storedDraftSchema.safeParse({
        ...draft,
        name: normalizeDesignName(draft.name),
      });
      if (!parsed.success)
        throw new StorageError("failed", `Invalid draft: ${parsed.error.message}`);
      const database = await db();
      await transact(database, STORE.drafts, "readwrite", (tx) => {
        tx.objectStore(STORE.drafts).put(parsed.data);
        return () => undefined;
      });
    },

    async deleteDraft(toolId) {
      const database = await db();
      await transact(database, STORE.drafts, "readwrite", (tx) => {
        tx.objectStore(STORE.drafts).delete(toolId);
        return () => undefined;
      });
    },

    async requestPersistence() {
      if (!persist) return null;
      const database = await db();
      const first = await transact(database, STORE.meta, "readwrite", (tx) => {
        const store = tx.objectStore(STORE.meta);
        const request = store.get(PERSIST_KEY);
        let isFirst = false;
        request.onsuccess = () => {
          if (request.result !== undefined) return;
          isFirst = true;
          store.put({ key: PERSIST_KEY, value: true });
        };
        return () => isFirst;
      });
      if (!first) return null;
      try {
        return await persist();
      } catch (error) {
        throw toStorageError(error);
      }
    },

    close: connection.close,
  };
}
