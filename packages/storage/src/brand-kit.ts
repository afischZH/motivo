/**
 * The brand kit in IndexedDB (M3-AP05): palettes, logos and own shapes of
 * the user's brand. Everything stays in this browser; moving it to another
 * device goes through a brand kit file (`@musterli/editor-ui` brand-kit
 * transfer).
 *
 * Layout (database `motivo`, palettes and assets since version 2, fonts
 * since version 4, see idb.ts):
 *  - `brand-palettes`: id, name, 2 to 10 colours (`#rrggbb`), timestamps;
 *  - `brand-assets`: id, kind (`logo` | `shape`), name, image (sanitised
 *    SVG or re-encoded raster, like an upload param), `createdAt`;
 *  - `brand-fonts` (M6-AP03): id, name, format (`woff2`, `woff`, `ttf`,
 *    `otf`), the file's bytes as an `ArrayBuffer` (at most 2 MB, signature
 *    checked), `createdAt`; at most 10;
 *  - `meta` key `brand-default-palette`: id of the default palette, which
 *    the editor preselects. The first palette becomes the default; deleting
 *    the default moves the mark to the oldest remaining palette.
 *
 * Nothing here sanitises: callers hand over images that went through the
 * sanitizer (uploads) or the import validation (files). Every record is
 * still checked against the schema on write and on read.
 */
import { createConnection, randomHexId } from "./connection";
import { STORE, StorageError, transact } from "./idb";
import {
  BRAND_FONTS_MAX,
  BRAND_PALETTES_MAX,
  brandAssetLimit,
  brandFontSchema,
  brandAssetSchema,
  brandPaletteSchema,
  normalizeBrandHex,
  normalizeBrandName,
  type BrandAsset,
  type BrandAssetKind,
  type BrandFont,
  type BrandFontFormat,
  type BrandImage,
  type BrandPalette,
} from "./brand-schema";

export const DEFAULT_PALETTE_KEY = "brand-default-palette";

export interface BrandPaletteInput {
  name: string;
  colors: readonly string[];
}

export interface BrandAssetInput {
  kind: BrandAssetKind;
  name: string;
  image: BrandImage;
}

export interface BrandFontInput {
  name: string;
  format: BrandFontFormat;
  data: ArrayBuffer;
}

export interface BrandPalettes {
  /** Oldest first. */
  palettes: BrandPalette[];
  /** `null` when there is no palette (or the mark points nowhere). */
  defaultId: string | null;
}

/** Everything of the brand kit, for the file export. */
export interface BrandKitSnapshot extends BrandPalettes {
  /** Oldest first. */
  assets: BrandAsset[];
  /** Oldest first (always set by `getAll`; optional for snapshots built by hand). */
  fonts?: BrandFont[];
}

/** What a validated brand kit file brings. */
export interface BrandKitImport {
  palettes: readonly BrandPalette[];
  assets: readonly BrandAsset[];
  /** Missing in files from before M6-AP03. */
  fonts?: readonly BrandFont[];
  /** The file's default palette, used only when this browser has none. */
  defaultId: string | null;
}

export interface BrandImportOutcome {
  palettes: number;
  assets: number;
  fonts: number;
  /** Entries that already exist with the same content. */
  duplicates: number;
  /** Entries left out because a list was full. */
  overLimit: number;
}

export interface BrandKitStore {
  loadPalettes(): Promise<BrandPalettes>;
  createPalette(input: BrandPaletteInput): Promise<BrandPalette>;
  /** Replaces name and colours. Throws `not-found`. */
  updatePalette(id: string, input: BrandPaletteInput): Promise<BrandPalette>;
  removePalette(id: string): Promise<void>;
  /** Puts a removed palette back unchanged (undo), and its default mark. */
  restorePalette(palette: BrandPalette, wasDefault: boolean): Promise<void>;
  setDefaultPalette(id: string): Promise<void>;
  /** Assets of one kind (or all), oldest first. */
  listAssets(kind?: BrandAssetKind): Promise<BrandAsset[]>;
  getAsset(id: string): Promise<BrandAsset | null>;
  addAsset(input: BrandAssetInput): Promise<BrandAsset>;
  renameAsset(id: string, name: string): Promise<void>;
  removeAsset(id: string): Promise<void>;
  restoreAsset(asset: BrandAsset): Promise<void>;
  /** Own fonts, oldest first. */
  listFonts(): Promise<BrandFont[]>;
  getFont(id: string): Promise<BrandFont | null>;
  /** Adds a font (bytes checked against its format). Throws `limit` with 10 fonts. */
  addFont(input: BrandFontInput): Promise<BrandFont>;
  renameFont(id: string, name: string): Promise<void>;
  removeFont(id: string): Promise<void>;
  restoreFont(font: BrandFont): Promise<void>;
  getAll(): Promise<BrandKitSnapshot>;
  /** Adds validated entries in one transaction (all or nothing). */
  importBrandKit(data: BrandKitImport): Promise<BrandImportOutcome>;
  close(): void;
}

export interface BrandKitStoreOptions {
  indexedDB?: IDBFactory;
  databaseName?: string;
  now?: () => number;
  randomId?: () => string;
}

function parsePalette(value: unknown): BrandPalette | null {
  const parsed = brandPaletteSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseAsset(value: unknown): BrandAsset | null {
  const parsed = brandAssetSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseFont(value: unknown): BrandFont | null {
  const parsed = brandFontSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function validFont(row: BrandFont): BrandFont {
  const parsed = brandFontSchema.safeParse(row);
  if (!parsed.success) throw new StorageError("failed", `Invalid font: ${parsed.error.message}`);
  return parsed.data;
}

/** Same bytes (fonts are few and small, a full compare is cheap). */
function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

const byCreated = <T extends { createdAt: number; name: string }>(a: T, b: T) =>
  a.createdAt - b.createdAt || a.name.localeCompare(b.name);

/** Normalised colours; throws for anything that is not a valid palette. */
function cleanColors(colors: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of colors) {
    const hex = typeof c === "string" ? normalizeBrandHex(c) : null;
    if (!hex) throw new StorageError("failed", `Invalid colour ${String(c)}`);
    out.push(hex);
  }
  return out;
}

function validPalette(row: BrandPalette): BrandPalette {
  const parsed = brandPaletteSchema.safeParse(row);
  if (!parsed.success) throw new StorageError("failed", `Invalid palette: ${parsed.error.message}`);
  return parsed.data;
}

function validAsset(row: BrandAsset): BrandAsset {
  const parsed = brandAssetSchema.safeParse(row);
  if (!parsed.success) throw new StorageError("failed", `Invalid asset: ${parsed.error.message}`);
  return parsed.data;
}

/** Same colours in the same order and the same name. */
const samePalette = (a: BrandPalette, b: BrandPalette) =>
  a.name === b.name &&
  a.colors.length === b.colors.length &&
  a.colors.every((c, i) => c === b.colors[i]);

const imageKey = (image: BrandImage) =>
  image.kind === "svg" ? `s:${image.svg}` : `r:${image.href}`;

/** Reads the default mark inside a transaction and resolves it against `palettes`. */
function resolveDefault(value: unknown, palettes: readonly BrandPalette[]): string | null {
  const id = (value as { value?: unknown } | undefined)?.value;
  if (typeof id === "string" && palettes.some((p) => p.id === id)) return id;
  return palettes[0]?.id ?? null;
}

export function createBrandKitStore(options: BrandKitStoreOptions = {}): BrandKitStore {
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? randomHexId;
  const connection = createConnection(options);
  const db = connection.db;

  const readPalettes = (tx: IDBTransaction) => {
    const rows = tx.objectStore(STORE.brandPalettes).getAll();
    const mark = tx.objectStore(STORE.meta).get(DEFAULT_PALETTE_KEY);
    return (): BrandPalettes => {
      const palettes = (rows.result as unknown[])
        .map(parsePalette)
        .filter((p): p is BrandPalette => p !== null)
        .sort(byCreated);
      return { palettes, defaultId: resolveDefault(mark.result, palettes) };
    };
  };

  const readAssets = (tx: IDBTransaction, kind?: BrandAssetKind) => {
    const rows = tx.objectStore(STORE.brandAssets).getAll();
    return (): BrandAsset[] =>
      (rows.result as unknown[])
        .map(parseAsset)
        .filter((a): a is BrandAsset => a !== null && (kind === undefined || a.kind === kind))
        .sort(byCreated);
  };

  const readFonts = (tx: IDBTransaction) => {
    const rows = tx.objectStore(STORE.brandFonts).getAll();
    return (): BrandFont[] =>
      (rows.result as unknown[])
        .map(parseFont)
        .filter((f): f is BrandFont => f !== null)
        .sort(byCreated);
  };

  const setMark = (tx: IDBTransaction, id: string | null) => {
    const meta = tx.objectStore(STORE.meta);
    if (id === null) meta.delete(DEFAULT_PALETTE_KEY);
    else meta.put({ key: DEFAULT_PALETTE_KEY, value: id });
  };

  return {
    async loadPalettes() {
      const database = await db();
      return transact(database, [STORE.brandPalettes, STORE.meta], "readonly", readPalettes);
    },

    async createPalette(input) {
      const t = now();
      const row = validPalette({
        id: randomId(),
        name: normalizeBrandName(input.name),
        colors: cleanColors(input.colors),
        createdAt: t,
        updatedAt: t,
      });
      const database = await db();
      const ok = await transact(database, [STORE.brandPalettes, STORE.meta], "readwrite", (tx) => {
        const store = tx.objectStore(STORE.brandPalettes);
        const count = store.count();
        let added = false;
        count.onsuccess = () => {
          if (count.result >= BRAND_PALETTES_MAX) return;
          added = true;
          store.put(row);
          // The first palette becomes the default.
          if (count.result === 0) setMark(tx, row.id);
        };
        return () => added;
      });
      if (!ok) throw new StorageError("limit", "Too many palettes");
      return row;
    },

    async updatePalette(id, input) {
      const database = await db();
      const result = await transact(database, STORE.brandPalettes, "readwrite", (tx) => {
        const store = tx.objectStore(STORE.brandPalettes);
        const request = store.get(id);
        let out: BrandPalette | null = null;
        request.onsuccess = () => {
          const old = parsePalette(request.result);
          if (!old) return;
          out = validPalette({
            ...old,
            name: normalizeBrandName(input.name),
            colors: cleanColors(input.colors),
            updatedAt: Math.max(now(), old.updatedAt),
          });
          store.put(out);
        };
        return () => out;
      });
      if (!result) throw new StorageError("not-found", `No palette ${id}`);
      return result;
    },

    async removePalette(id) {
      const database = await db();
      await transact(database, [STORE.brandPalettes, STORE.meta], "readwrite", (tx) => {
        tx.objectStore(STORE.brandPalettes).delete(id);
        // Requests run in order: the list below no longer has `id`.
        const rows = tx.objectStore(STORE.brandPalettes).getAll();
        const mark = tx.objectStore(STORE.meta).get(DEFAULT_PALETTE_KEY);
        mark.onsuccess = () => {
          const current = (mark.result as { value?: unknown } | undefined)?.value;
          if (current !== id) return;
          const rest = (rows.result as unknown[])
            .map(parsePalette)
            .filter((p): p is BrandPalette => p !== null)
            .sort(byCreated);
          setMark(tx, rest[0]?.id ?? null);
        };
        return () => undefined;
      });
    },

    async restorePalette(palette, wasDefault) {
      const row = validPalette(palette);
      const database = await db();
      await transact(database, [STORE.brandPalettes, STORE.meta], "readwrite", (tx) => {
        tx.objectStore(STORE.brandPalettes).put(row);
        if (wasDefault) setMark(tx, row.id);
        return () => undefined;
      });
    },

    async setDefaultPalette(id) {
      const database = await db();
      const ok = await transact(database, [STORE.brandPalettes, STORE.meta], "readwrite", (tx) => {
        const request = tx.objectStore(STORE.brandPalettes).get(id);
        let found = false;
        request.onsuccess = () => {
          if (!parsePalette(request.result)) return;
          found = true;
          setMark(tx, id);
        };
        return () => found;
      });
      if (!ok) throw new StorageError("not-found", `No palette ${id}`);
    },

    async listAssets(kind) {
      const database = await db();
      return transact(database, STORE.brandAssets, "readonly", (tx) => readAssets(tx, kind));
    },

    async getAsset(id) {
      const database = await db();
      return transact(database, STORE.brandAssets, "readonly", (tx) => {
        const request = tx.objectStore(STORE.brandAssets).get(id);
        return () => parseAsset(request.result);
      });
    },

    async addAsset(input) {
      const row = validAsset({
        id: randomId(),
        kind: input.kind,
        name: normalizeBrandName(input.name),
        image: input.image,
        createdAt: now(),
      });
      const database = await db();
      const ok = await transact(database, STORE.brandAssets, "readwrite", (tx) => {
        const store = tx.objectStore(STORE.brandAssets);
        const all = store.getAll();
        let added = false;
        all.onsuccess = () => {
          const same = (all.result as unknown[])
            .map(parseAsset)
            .filter((a) => a?.kind === row.kind).length;
          if (same >= brandAssetLimit(row.kind)) return;
          added = true;
          store.put(row);
        };
        return () => added;
      });
      if (!ok) throw new StorageError("limit", `Too many ${input.kind}s`);
      return row;
    },

    async renameAsset(id, name) {
      const clean = normalizeBrandName(name);
      const database = await db();
      const ok = await transact(database, STORE.brandAssets, "readwrite", (tx) => {
        const store = tx.objectStore(STORE.brandAssets);
        const request = store.get(id);
        let found = false;
        request.onsuccess = () => {
          const old = parseAsset(request.result);
          if (!old) return;
          found = true;
          store.put(validAsset({ ...old, name: clean }));
        };
        return () => found;
      });
      if (!ok) throw new StorageError("not-found", `No asset ${id}`);
    },

    async removeAsset(id) {
      const database = await db();
      await transact(database, STORE.brandAssets, "readwrite", (tx) => {
        tx.objectStore(STORE.brandAssets).delete(id);
        return () => undefined;
      });
    },

    async restoreAsset(asset) {
      const row = validAsset(asset);
      const database = await db();
      await transact(database, STORE.brandAssets, "readwrite", (tx) => {
        tx.objectStore(STORE.brandAssets).put(row);
        return () => undefined;
      });
    },

    async listFonts() {
      const database = await db();
      return transact(database, STORE.brandFonts, "readonly", readFonts);
    },

    async getFont(id) {
      const database = await db();
      return transact(database, STORE.brandFonts, "readonly", (tx) => {
        const request = tx.objectStore(STORE.brandFonts).get(id);
        return () => parseFont(request.result);
      });
    },

    async addFont(input) {
      const row = validFont({
        id: randomId(),
        name: normalizeBrandName(input.name),
        format: input.format,
        // A copy: the caller's buffer may be transferred or reused.
        data: input.data.slice(0),
        createdAt: now(),
      });
      const database = await db();
      const ok = await transact(database, STORE.brandFonts, "readwrite", (tx) => {
        const store = tx.objectStore(STORE.brandFonts);
        const count = store.count();
        let added = false;
        count.onsuccess = () => {
          if (count.result >= BRAND_FONTS_MAX) return;
          added = true;
          store.put(row);
        };
        return () => added;
      });
      if (!ok) throw new StorageError("limit", "Too many fonts");
      return row;
    },

    async renameFont(id, name) {
      const clean = normalizeBrandName(name);
      const database = await db();
      const ok = await transact(database, STORE.brandFonts, "readwrite", (tx) => {
        const store = tx.objectStore(STORE.brandFonts);
        const request = store.get(id);
        let found = false;
        request.onsuccess = () => {
          const old = parseFont(request.result);
          if (!old) return;
          found = true;
          store.put(validFont({ ...old, name: clean }));
        };
        return () => found;
      });
      if (!ok) throw new StorageError("not-found", `No font ${id}`);
    },

    async removeFont(id) {
      const database = await db();
      await transact(database, STORE.brandFonts, "readwrite", (tx) => {
        tx.objectStore(STORE.brandFonts).delete(id);
        return () => undefined;
      });
    },

    async restoreFont(font) {
      const row = validFont(font);
      const database = await db();
      await transact(database, STORE.brandFonts, "readwrite", (tx) => {
        tx.objectStore(STORE.brandFonts).put(row);
        return () => undefined;
      });
    },

    async getAll() {
      const database = await db();
      return transact(
        database,
        [STORE.brandPalettes, STORE.brandAssets, STORE.brandFonts, STORE.meta],
        "readonly",
        (tx) => {
          const palettes = readPalettes(tx);
          const assets = readAssets(tx);
          const fonts = readFonts(tx);
          return () => ({ ...palettes(), assets: assets(), fonts: fonts() });
        },
      );
    },

    async importBrandKit(data) {
      const t = now();
      const database = await db();
      return transact(
        database,
        [STORE.brandPalettes, STORE.brandAssets, STORE.brandFonts, STORE.meta],
        "readwrite",
        (tx) => {
          const fontStore = tx.objectStore(STORE.brandFonts);
          const paletteStore = tx.objectStore(STORE.brandPalettes);
          const assetStore = tx.objectStore(STORE.brandAssets);
          const outcome: BrandImportOutcome = {
            palettes: 0,
            assets: 0,
            fonts: 0,
            duplicates: 0,
            overLimit: 0,
          };
          const palettesReq = paletteStore.getAll();
          const assetsReq = assetStore.getAll();
          const fontsReq = fontStore.getAll();
          const mark = tx.objectStore(STORE.meta).get(DEFAULT_PALETTE_KEY);
          mark.onsuccess = () => {
            const palettes = (palettesReq.result as unknown[])
              .map(parsePalette)
              .filter((p): p is BrandPalette => p !== null);
            const ids = new Set(palettes.map((p) => p.id));
            const hadDefault = resolveDefault(mark.result, palettes) !== null;
            let importedDefault: string | null = null;
            for (const palette of data.palettes) {
              const candidate = validPalette({
                ...palette,
                name: normalizeBrandName(palette.name),
                colors: cleanColors(palette.colors),
                createdAt: Math.min(palette.createdAt, t),
                updatedAt: Math.min(Math.max(palette.updatedAt, palette.createdAt), t),
              });
              if (palettes.some((p) => samePalette(p, candidate))) {
                outcome.duplicates++;
                continue;
              }
              if (palettes.length >= BRAND_PALETTES_MAX) {
                outcome.overLimit++;
                continue;
              }
              let id = candidate.id;
              while (ids.has(id)) id = randomId();
              const row = { ...candidate, id };
              ids.add(id);
              palettes.push(row);
              paletteStore.put(row);
              outcome.palettes++;
              if (palette.id === data.defaultId) importedDefault = id;
            }
            if (!hadDefault) {
              const first = [...palettes].sort(byCreated)[0];
              const next = importedDefault ?? first?.id ?? null;
              if (next !== null) setMark(tx, next);
            }

            const assets = (assetsReq.result as unknown[])
              .map(parseAsset)
              .filter((a): a is BrandAsset => a !== null);
            const assetIds = new Set(assets.map((a) => a.id));
            const keys = new Set(assets.map((a) => `${a.kind}|${imageKey(a.image)}`));
            for (const asset of data.assets) {
              const candidate = validAsset({
                ...asset,
                name: normalizeBrandName(asset.name),
                createdAt: Math.min(asset.createdAt, t),
              });
              const key = `${candidate.kind}|${imageKey(candidate.image)}`;
              if (keys.has(key)) {
                outcome.duplicates++;
                continue;
              }
              if (
                assets.filter((a) => a.kind === candidate.kind).length >=
                brandAssetLimit(candidate.kind)
              ) {
                outcome.overLimit++;
                continue;
              }
              let id = candidate.id;
              while (assetIds.has(id)) id = randomId();
              const row = { ...candidate, id };
              assetIds.add(id);
              keys.add(key);
              assets.push(row);
              assetStore.put(row);
              outcome.assets++;
            }

            const fonts = (fontsReq.result as unknown[])
              .map(parseFont)
              .filter((f): f is BrandFont => f !== null);
            const fontIds = new Set(fonts.map((f) => f.id));
            for (const font of data.fonts ?? []) {
              const candidate = validFont({
                ...font,
                name: normalizeBrandName(font.name),
                createdAt: Math.min(font.createdAt, t),
              });
              if (fonts.some((f) => sameBytes(f.data, candidate.data))) {
                outcome.duplicates++;
                continue;
              }
              if (fonts.length >= BRAND_FONTS_MAX) {
                outcome.overLimit++;
                continue;
              }
              let id = candidate.id;
              while (fontIds.has(id)) id = randomId();
              const row = { ...candidate, id };
              fontIds.add(id);
              fonts.push(row);
              fontStore.put(row);
              outcome.fonts++;
            }
          };
          return () => outcome;
        },
      );
    },

    close: connection.close,
  };
}
