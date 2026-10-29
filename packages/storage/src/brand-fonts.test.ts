import {
  DEFAULT_FONT_FAMILY,
  createBackgroundLayer,
  createScene,
  createTextLayer,
} from "@musterli/scene";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBrandKitStore, type BrandKitStore } from "./brand-kit";
import {
  BRAND_FONT_MAX_BYTES,
  BRAND_FONTS_MAX,
  brandFontSchema,
  sniffFontFormat,
  type BrandFont,
} from "./brand-schema";
import { DB_NAME, DB_VERSION, STORE, openDatabase, transact } from "./idb";
import { createSocialDesignStore } from "./social";

let factory: IDBFactory;
let clock: number;
let ids: number;
let store: BrandKitStore;

/** Bytes that start with a font signature (storage only checks signature and size). */
function fontBytes(tag: string, size = 64, fill = 1): ArrayBuffer {
  const bytes = new Uint8Array(size).fill(fill);
  for (let i = 0; i < 4; i++) bytes[i] = tag.charCodeAt(i);
  return bytes.buffer;
}

const TTF_TAG = "\u0000\u0001\u0000\u0000";

beforeEach(() => {
  factory = new IDBFactory();
  clock = 1_000;
  ids = 0;
  store = createBrandKitStore({
    indexedDB: factory,
    now: () => clock,
    randomId: () => `f${++ids}`,
  });
});

afterEach(() => store.close());

describe("font signatures", () => {
  it("knows WOFF2, WOFF, OpenType and TrueType, nothing else", () => {
    const head = (tag: string) => new Uint8Array(fontBytes(tag, 8));
    expect(sniffFontFormat(head("wOF2"))).toBe("woff2");
    expect(sniffFontFormat(head("wOFF"))).toBe("woff");
    expect(sniffFontFormat(head("OTTO"))).toBe("otf");
    expect(sniffFontFormat(head(TTF_TAG))).toBe("ttf");
    expect(sniffFontFormat(head("true"))).toBe("ttf");
    expect(sniffFontFormat(head("ttcf"))).toBeNull();
    expect(sniffFontFormat(head("<svg"))).toBeNull();
    expect(sniffFontFormat(new Uint8Array([0x77, 0x4f]))).toBeNull();
  });

  it("checks size and that the bytes are the declared format", () => {
    const font = (over: Partial<BrandFont>) =>
      brandFontSchema.safeParse({
        id: "a",
        name: "A",
        format: "woff2",
        data: fontBytes("wOF2"),
        createdAt: 1,
        ...over,
      }).success;
    expect(font({})).toBe(true);
    expect(font({ format: "ttf" })).toBe(false);
    expect(font({ data: fontBytes("wOF2", 8) })).toBe(false);
    expect(font({ data: fontBytes("wOF2", BRAND_FONT_MAX_BYTES + 1) })).toBe(false);
    expect(font({ data: new Uint8Array(fontBytes("wOF2")) as unknown as ArrayBuffer })).toBe(false);
    expect(font({ format: "eot" as never })).toBe(false);
  });
});

describe("brand fonts", () => {
  it("adds, lists, renames, removes and restores fonts", async () => {
    const a = await store.addFont({
      name: " Haus\tschrift ",
      format: "woff2",
      data: fontBytes("wOF2"),
    });
    expect(a).toMatchObject({ id: "f1", name: "Haus schrift", format: "woff2", createdAt: 1_000 });
    clock = 2_000;
    await store.addFont({ name: "Zweite", format: "ttf", data: fontBytes(TTF_TAG) });
    expect((await store.listFonts()).map((f) => f.name)).toEqual(["Haus schrift", "Zweite"]);
    const read = await store.getFont("f1");
    expect(read?.data.byteLength).toBe(64);
    expect(new Uint8Array(read?.data ?? new ArrayBuffer(0))[0]).toBe("w".charCodeAt(0));

    await store.renameFont("f1", "Neu");
    expect((await store.getFont("f1"))?.name).toBe("Neu");
    await expect(store.renameFont("nope", "x")).rejects.toMatchObject({ code: "not-found" });

    const removed = (await store.getFont("f1")) as BrandFont;
    await store.removeFont("f1");
    expect(await store.getFont("f1")).toBeNull();
    await store.restoreFont(removed);
    expect((await store.listFonts()).map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("refuses files that are not the declared font and caps the list", async () => {
    await expect(
      store.addFont({ name: "x", format: "woff2", data: fontBytes("PK\u0003\u0004") }),
    ).rejects.toMatchObject({ code: "failed" });
    for (let i = 0; i < BRAND_FONTS_MAX; i++) {
      await store.addFont({ name: `F${i}`, format: "otf", data: fontBytes("OTTO", 64, i) });
    }
    await expect(
      store.addFont({ name: "zu viel", format: "otf", data: fontBytes("OTTO") }),
    ).rejects.toMatchObject({ code: "limit" });
  });

  it("leaves tampered records out", async () => {
    await store.addFont({ name: "Gut", format: "woff", data: fontBytes("wOFF") });
    const db = await openDatabase(factory);
    await transact(db, STORE.brandFonts, "readwrite", (tx) => {
      const fonts = tx.objectStore(STORE.brandFonts);
      fonts.put({ id: "bad1", name: "Skript", format: "woff2", data: "<script>", createdAt: 1 });
      fonts.put({
        id: "bad2",
        name: "Falsch",
        format: "woff2",
        data: fontBytes("OTTO"),
        createdAt: 1,
      });
      return () => undefined;
    });
    db.close();
    expect((await store.listFonts()).map((f) => f.name)).toEqual(["Gut"]);
    expect(await store.getFont("bad2")).toBeNull();
  });

  it("imports fonts, skips identical bytes, renames id conflicts and keeps the limit", async () => {
    await store.addFont({ name: "Lokal", format: "woff2", data: fontBytes("wOF2", 64, 9) });
    const file = (id: string, fill: number): BrandFont => ({
      id,
      name: `Datei ${id}`,
      format: "woff2",
      data: fontBytes("wOF2", 64, fill),
      createdAt: 9_000_000_000_000,
    });
    const outcome = await store.importBrandKit({
      palettes: [],
      assets: [],
      fonts: [file("f1", 1), file("x2", 2), file("x3", 9)],
      defaultId: null,
    });
    expect(outcome).toEqual({ palettes: 0, assets: 0, fonts: 2, duplicates: 1, overLimit: 0 });
    const fonts = await store.listFonts();
    expect(fonts.map((f) => f.id).sort()).toEqual(["f1", "f2", "x2"]);
    // Future timestamps are capped.
    expect(fonts.every((f) => f.createdAt <= clock)).toBe(true);

    const many = Array.from({ length: BRAND_FONTS_MAX }, (_, i) => file(`m${i}`, 20 + i));
    const full = await store.importBrandKit({
      palettes: [],
      assets: [],
      fonts: many,
      defaultId: null,
    });
    expect(full.fonts).toBe(BRAND_FONTS_MAX - 3);
    expect(full.overLimit).toBe(3);
    expect(await store.listFonts()).toHaveLength(BRAND_FONTS_MAX);

    // Files from before M6-AP03 have no fonts at all.
    const old = await store.importBrandKit({ palettes: [], assets: [], defaultId: null });
    expect(old.fonts).toBe(0);
  });

  it("includes fonts in the export snapshot", async () => {
    await store.addFont({ name: "A", format: "otf", data: fontBytes("OTTO") });
    const all = await store.getAll();
    expect(all.fonts).toHaveLength(1);
    expect(all.fonts?.[0]?.data.byteLength).toBe(64);
  });
});

describe("database upgrade to version 4", () => {
  /** Creates a database exactly as version 3 (M6-AP02) left it, with real data. */
  async function createVersion3(): Promise<void> {
    const s = createScene("square");
    // An AP02 text layer: system font stack, no font reference.
    const text = createTextLayer("t1", s.format, "Hallo");
    delete text.font;
    const scene = {
      ...s,
      layers: [
        createBackgroundLayer("bg", s.format, { id: "blob", version: 1, params: {} }, 3),
        { ...text, fontFamily: DEFAULT_FONT_FAMILY },
      ],
    };
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(DB_NAME, 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of [
          STORE.designs,
          STORE.designParams,
          STORE.brandPalettes,
          STORE.brandAssets,
          STORE.socialDesigns,
          STORE.socialScenes,
          STORE.socialDrafts,
        ]) {
          db.createObjectStore(name, { keyPath: "id" });
        }
        db.createObjectStore(STORE.drafts, { keyPath: "toolId" });
        db.createObjectStore(STORE.meta, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(
          [
            STORE.meta,
            STORE.brandPalettes,
            STORE.brandAssets,
            STORE.socialDesigns,
            STORE.socialScenes,
            STORE.socialDrafts,
          ],
          "readwrite",
        );
        tx.objectStore(STORE.meta).put({ key: "brand-default-palette", value: "p1" });
        tx.objectStore(STORE.brandPalettes).put({
          id: "p1",
          name: "Hausfarben",
          colors: ["#000000", "#ff6600"],
          createdAt: 1,
          updatedAt: 2,
        });
        tx.objectStore(STORE.brandAssets).put({
          id: "logo1",
          kind: "logo",
          name: "Logo",
          image: {
            kind: "svg",
            svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
            width: 10,
            height: 10,
            name: "logo.svg",
          },
          createdAt: 3,
        });
        tx.objectStore(STORE.socialDesigns).put({
          id: "s1",
          name: "Erster Post",
          format: scene.format,
          createdAt: 10,
          updatedAt: 20,
          thumbnail: null,
        });
        tx.objectStore(STORE.socialScenes).put({ id: "s1", scene });
        tx.objectStore(STORE.socialDrafts).put({
          id: "current",
          designId: "s1",
          name: "Erster Post",
          scene,
          updatedAt: 30,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  it("keeps every version 3 record and adds the font store", async () => {
    await createVersion3();
    expect(DB_VERSION).toBe(4);
    const db = await openDatabase(factory);
    expect(db.version).toBe(4);
    expect(db.objectStoreNames.contains(STORE.brandFonts)).toBe(true);
    db.close();

    expect(await store.loadPalettes()).toMatchObject({
      defaultId: "p1",
      palettes: [{ id: "p1", name: "Hausfarben" }],
    });
    expect(await store.listAssets("logo")).toHaveLength(1);
    expect(await store.listFonts()).toEqual([]);

    const social = createSocialDesignStore({ indexedDB: factory });
    const design = await social.get("s1");
    expect(design?.name).toBe("Erster Post");
    const text = design?.scene.layers[1];
    // AP02 text layers have no font reference and stay valid.
    expect(text?.kind === "text" && text.font).toBeUndefined();
    expect((await social.getDraft())?.designId).toBe("s1");
    social.close();

    await store.addFont({ name: "Neu", format: "woff2", data: fontBytes("wOF2") });
    expect(await store.listFonts()).toHaveLength(1);
  });

  it("upgrades while an old tab holds version 3 open (and lets go)", async () => {
    await createVersion3();
    const oldDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    oldDb.onversionchange = () => oldDb.close();
    await expect(store.listFonts()).resolves.toEqual([]);
  });
});
