/**
 * Social editor designs in IndexedDB (M6-AP02, database version 3). Same
 * layout as tool designs, in stores of their own so the two never mix:
 *  - `social-designs`: id, name, format, timestamps, thumbnail (the "Social"
 *    section of "Meine Designs" lists these without loading scenes);
 *  - `social-scenes`: the scene of each design (uploads make it large);
 *  - `social-drafts`: one autosave draft (`id: "current"`).
 * Every record is validated with Zod on read (`@musterli/scene` for scenes);
 * broken records are left out instead of breaking the page.
 */
import { parseEditedScene, sceneSchema, type Scene } from "@musterli/scene";
// Namespace import keeps zod tree-shakable (see tool-registry/common.ts).
import * as z from "zod";
import { createConnection, randomHexId } from "./connection";
import { normalizeDesignName, toStoredThumbnail } from "./designs";
import { STORE, StorageError, transact } from "./idb";
import { designIdSchema, designNameSchema, storedThumbnailSchema, timestampSchema } from "./schema";

const formatSchema = z.object({
  id: z.string().max(64).nullable(),
  width: z.int().min(16).max(8192),
  height: z.int().min(16).max(8192),
});

export const storedSocialDesignSchema = z.object({
  id: designIdSchema,
  name: designNameSchema,
  format: formatSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  thumbnail: storedThumbnailSchema.nullable(),
});

export const storedSocialSceneSchema = z.object({
  id: designIdSchema,
  scene: sceneSchema,
});

export const SOCIAL_DRAFT_ID = "current";

export const storedSocialDraftSchema = z.object({
  id: z.literal(SOCIAL_DRAFT_ID),
  /** The saved design the draft belongs to, or `null` for an unsaved one. */
  designId: designIdSchema.nullable(),
  name: designNameSchema,
  scene: sceneSchema,
  updatedAt: timestampSchema,
});

type StoredSocialDesign = z.output<typeof storedSocialDesignSchema>;
export type SocialDraft = Omit<z.output<typeof storedSocialDraftSchema>, "id">;
export type SocialFormatInfo = z.output<typeof formatSchema>;

export interface SocialDesignSummary {
  id: string;
  name: string;
  format: SocialFormatInfo;
  createdAt: number;
  updatedAt: number;
  thumbnail: Blob | null;
}

export interface SocialDesignRecord extends SocialDesignSummary {
  scene: Scene;
}

export interface SocialDesignInput {
  name: string;
  scene: Scene;
  /** `undefined` keeps the stored thumbnail on update. */
  thumbnail?: Blob | null;
  /**
   * The scene comes from the editor, which only holds validated scenes:
   * checked with `parseEditedScene` (picture data by length only), so a
   * save never runs the picture patterns over megabytes on the main thread.
   */
  edited?: boolean;
}

export interface SocialDraftOptions {
  /** As `SocialDesignInput.edited`. */
  edited?: boolean;
}

/** A design from an import file: own id and timestamps, no thumbnail. */
export interface ImportedSocialDesign {
  id: string;
  name: string;
  scene: Scene;
  createdAt: number;
  updatedAt: number;
}

export interface SocialImportOutcome {
  added: string[];
  duplicates: number;
}

export interface SocialDesignStore {
  list(): Promise<SocialDesignSummary[]>;
  get(id: string): Promise<SocialDesignRecord | null>;
  getAll(): Promise<SocialDesignRecord[]>;
  create(input: SocialDesignInput): Promise<SocialDesignRecord>;
  update(id: string, input: SocialDesignInput): Promise<SocialDesignRecord>;
  rename(id: string, name: string): Promise<void>;
  duplicate(id: string, name: string): Promise<SocialDesignRecord>;
  remove(id: string): Promise<void>;
  restore(record: SocialDesignRecord): Promise<void>;
  setThumbnail(id: string, thumbnail: Blob | null): Promise<void>;
  importDesigns(designs: readonly ImportedSocialDesign[]): Promise<SocialImportOutcome>;
  getDraft(): Promise<SocialDraft | null>;
  putDraft(draft: SocialDraft, options?: SocialDraftOptions): Promise<void>;
  deleteDraft(): Promise<void>;
  close(): void;
}

export interface SocialDesignStoreOptions {
  indexedDB?: IDBFactory;
  databaseName?: string;
  now?: () => number;
  randomId?: () => string;
}

function toSummary(row: StoredSocialDesign): SocialDesignSummary {
  const { thumbnail, ...rest } = row;
  return {
    ...rest,
    format: { ...row.format },
    thumbnail: thumbnail ? new Blob([thumbnail.bytes], { type: thumbnail.type }) : null,
  };
}

function parseRow(value: unknown): StoredSocialDesign | null {
  const parsed = storedSocialDesignSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseScene(value: unknown): Scene | null {
  const parsed = storedSocialSceneSchema.safeParse(value);
  return parsed.success ? parsed.data.scene : null;
}

function validScene(scene: Scene, edited = false): Scene {
  const parsed = edited ? parseEditedScene(scene) : sceneSchema.safeParse(scene);
  if (!parsed.success) {
    const message = typeof parsed.error === "string" ? parsed.error : parsed.error.message;
    throw new StorageError("failed", `Invalid scene: ${message}`);
  }
  return parsed.data;
}

function validRow(row: StoredSocialDesign): StoredSocialDesign {
  const parsed = storedSocialDesignSchema.safeParse(row);
  if (!parsed.success) throw new StorageError("failed", `Invalid design: ${parsed.error.message}`);
  return row;
}

const formatOf = (scene: Scene): SocialFormatInfo => ({
  id: scene.format.id,
  width: scene.format.width,
  height: scene.format.height,
});

export function createSocialDesignStore(options: SocialDesignStoreOptions = {}): SocialDesignStore {
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? randomHexId;
  const connection = createConnection(options);
  const db = connection.db;
  const both = [STORE.socialDesigns, STORE.socialScenes] as const;

  const getRecord = async (id: string): Promise<SocialDesignRecord | null> => {
    const database = await db();
    return transact(database, both, "readonly", (tx) => {
      const row = tx.objectStore(STORE.socialDesigns).get(id);
      const scene = tx.objectStore(STORE.socialScenes).get(id);
      return () => {
        const r = parseRow(row.result);
        const s = parseScene(scene.result);
        return r && s ? { ...toSummary(r), scene: s } : null;
      };
    });
  };

  const getRow = async (id: string): Promise<StoredSocialDesign | null> => {
    const database = await db();
    return transact(database, STORE.socialDesigns, "readonly", (tx) => {
      const request = tx.objectStore(STORE.socialDesigns).get(id);
      return () => parseRow(request.result);
    });
  };

  const write = async (row: StoredSocialDesign, scene: Scene): Promise<void> => {
    const database = await db();
    await transact(database, both, "readwrite", (tx) => {
      tx.objectStore(STORE.socialDesigns).put(row);
      tx.objectStore(STORE.socialScenes).put({ id: row.id, scene });
      return () => undefined;
    });
  };

  const patchRow = async (id: string, change: (row: StoredSocialDesign) => StoredSocialDesign) => {
    const database = await db();
    const found = await transact(database, STORE.socialDesigns, "readwrite", (tx) => {
      const store = tx.objectStore(STORE.socialDesigns);
      const request = store.get(id);
      let ok = false;
      request.onsuccess = () => {
        const row = parseRow(request.result);
        if (!row) return;
        ok = true;
        store.put(validRow(change(row)));
      };
      return () => ok;
    });
    if (!found) throw new StorageError("not-found", `No social design ${id}`);
  };

  const create = async (input: SocialDesignInput): Promise<SocialDesignRecord> => {
    const scene = validScene(input.scene, input.edited);
    const t = now();
    const row = validRow({
      id: randomId(),
      name: normalizeDesignName(input.name),
      format: formatOf(scene),
      createdAt: t,
      updatedAt: t,
      thumbnail: await toStoredThumbnail(input.thumbnail),
    });
    await write(row, scene);
    return { ...toSummary(row), scene };
  };

  return {
    async list() {
      const database = await db();
      return transact(database, STORE.socialDesigns, "readonly", (tx) => {
        const request = tx.objectStore(STORE.socialDesigns).getAll();
        return () =>
          (request.result as unknown[])
            .map(parseRow)
            .filter((row): row is StoredSocialDesign => row !== null)
            .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name))
            .map(toSummary);
      });
    },

    get: getRecord,

    async getAll() {
      const database = await db();
      return transact(database, both, "readonly", (tx) => {
        const rows = tx.objectStore(STORE.socialDesigns).getAll();
        const scenes = tx.objectStore(STORE.socialScenes).getAll();
        return () => {
          const byId = new Map<string, Scene>();
          for (const value of scenes.result as unknown[]) {
            const parsed = storedSocialSceneSchema.safeParse(value);
            if (parsed.success) byId.set(parsed.data.id, parsed.data.scene);
          }
          const out: SocialDesignRecord[] = [];
          for (const value of rows.result as unknown[]) {
            const row = parseRow(value);
            const scene = row ? byId.get(row.id) : undefined;
            if (row && scene) out.push({ ...toSummary(row), scene });
          }
          return out.sort((a, b) => b.updatedAt - a.updatedAt);
        };
      });
    },

    create,

    async update(id, input) {
      // Only the overview row: the stored scene is replaced, never read (or parsed) again.
      const existing = await getRow(id);
      if (!existing) throw new StorageError("not-found", `No social design ${id}`);
      const scene = validScene(input.scene, input.edited);
      const row = validRow({
        id,
        name: normalizeDesignName(input.name),
        format: formatOf(scene),
        createdAt: existing.createdAt,
        updatedAt: Math.max(now(), existing.updatedAt),
        thumbnail:
          input.thumbnail === undefined
            ? existing.thumbnail
            : await toStoredThumbnail(input.thumbnail),
      });
      await write(row, scene);
      return { ...toSummary(row), scene };
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
      if (!source) throw new StorageError("not-found", `No social design ${id}`);
      // The scene was just read and validated.
      return create({ name, scene: source.scene, thumbnail: source.thumbnail, edited: true });
    },

    async remove(id) {
      const database = await db();
      await transact(database, both, "readwrite", (tx) => {
        tx.objectStore(STORE.socialDesigns).delete(id);
        tx.objectStore(STORE.socialScenes).delete(id);
        return () => undefined;
      });
    },

    async restore(record) {
      const { scene, thumbnail, ...rest } = record;
      const row = validRow({
        ...rest,
        format: { ...rest.format },
        thumbnail: await toStoredThumbnail(thumbnail),
      });
      await write(row, validScene(scene));
    },

    async setThumbnail(id, thumbnail) {
      const stored = await toStoredThumbnail(thumbnail);
      await patchRow(id, (row) => ({ ...row, thumbnail: stored }));
    },

    async importDesigns(designs) {
      const checked = designs.map((d) => ({ ...d, scene: validScene(d.scene) }));
      const database = await db();
      const t = now();
      return transact(database, both, "readwrite", (tx) => {
        const rows = tx.objectStore(STORE.socialDesigns);
        const scenes = tx.objectStore(STORE.socialScenes);
        const added: string[] = [];
        let duplicates = 0;
        const request = rows.getAll();
        request.onsuccess = () => {
          const existing = new Map<string, StoredSocialDesign>();
          for (const value of request.result as unknown[]) {
            const row = parseRow(value);
            if (row) existing.set(row.id, row);
          }
          for (const design of checked) {
            const same = existing.get(design.id);
            if (
              same &&
              same.updatedAt === design.updatedAt &&
              same.name === normalizeDesignName(design.name)
            ) {
              duplicates++;
              continue;
            }
            let id = design.id;
            while (existing.has(id)) id = randomId();
            const row = validRow({
              id,
              name: normalizeDesignName(design.name),
              format: formatOf(design.scene),
              createdAt: Math.min(design.createdAt, t),
              updatedAt: Math.min(design.updatedAt, t),
              thumbnail: null,
            });
            existing.set(id, row);
            rows.put(row);
            scenes.put({ id, scene: design.scene });
            added.push(id);
          }
        };
        return () => ({ added, duplicates });
      });
    },

    async getDraft() {
      const database = await db();
      return transact(database, STORE.socialDrafts, "readonly", (tx) => {
        const request = tx.objectStore(STORE.socialDrafts).get(SOCIAL_DRAFT_ID);
        return () => {
          const parsed = storedSocialDraftSchema.safeParse(request.result);
          if (!parsed.success) return null;
          const { designId, name, scene, updatedAt } = parsed.data;
          return { designId, name, scene, updatedAt };
        };
      });
    },

    async putDraft(draft, options = {}) {
      // An edited scene is checked on its own (picture data by length only, see `validScene`).
      const scene = options.edited ? validScene(draft.scene, true) : draft.scene;
      const schema = options.edited
        ? storedSocialDraftSchema.omit({ scene: true })
        : storedSocialDraftSchema;
      const parsed = schema.safeParse({
        ...draft,
        id: SOCIAL_DRAFT_ID,
        name: normalizeDesignName(draft.name),
      });
      if (!parsed.success)
        throw new StorageError("failed", `Invalid draft: ${parsed.error.message}`);
      const record = options.edited ? { ...parsed.data, scene } : parsed.data;
      const database = await db();
      await transact(database, STORE.socialDrafts, "readwrite", (tx) => {
        tx.objectStore(STORE.socialDrafts).put(record);
        return () => undefined;
      });
    },

    async deleteDraft() {
      const database = await db();
      await transact(database, STORE.socialDrafts, "readwrite", (tx) => {
        tx.objectStore(STORE.socialDrafts).delete(SOCIAL_DRAFT_ID);
        return () => undefined;
      });
    },

    close: connection.close,
  };
}
