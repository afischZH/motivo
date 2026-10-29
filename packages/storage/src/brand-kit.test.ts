import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBrandKitStore, DEFAULT_PALETTE_KEY, type BrandKitStore } from "./brand-kit";
import {
  BRAND_LOGOS_MAX,
  BRAND_PALETTES_MAX,
  normalizeBrandHex,
  normalizeBrandName,
  type BrandAsset,
  type BrandPalette,
} from "./brand-schema";
import { createDesignStore } from "./designs";
import { DB_NAME, DB_VERSION, STORE, openDatabase } from "./idb";

let factory: IDBFactory;
let clock: number;
let ids: number;
let store: BrandKitStore;

const svg = (body = "<rect width='10' height='10'/>") => ({
  kind: "svg" as const,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`,
  width: 10,
  height: 10,
  name: "logo.svg",
});

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==";

beforeEach(() => {
  factory = new IDBFactory();
  clock = 1_000;
  ids = 0;
  store = createBrandKitStore({
    indexedDB: factory,
    now: () => clock,
    randomId: () => `b${++ids}`,
  });
});

afterEach(() => store.close());

describe("brand palettes", () => {
  it("creates palettes, normalises colours and marks the first as default", async () => {
    const a = await store.createPalette({ name: "  Haus\nfarben ", colors: ["#ABC", "#112233"] });
    expect(a).toMatchObject({ id: "b1", name: "Haus farben", colors: ["#aabbcc", "#112233"] });
    clock = 2_000;
    await store.createPalette({ name: "Zweite", colors: ["#000000", "#ffffff", "#ff0000"] });
    const { palettes, defaultId } = await store.loadPalettes();
    expect(palettes.map((p) => p.name)).toEqual(["Haus farben", "Zweite"]);
    expect(defaultId).toBe("b1");
  });

  it("rejects invalid palettes", async () => {
    await expect(store.createPalette({ name: "x", colors: ["#000000"] })).rejects.toMatchObject({
      code: "failed",
    });
    await expect(
      store.createPalette({ name: "x", colors: Array(11).fill("#000000") }),
    ).rejects.toMatchObject({ code: "failed" });
    await expect(
      store.createPalette({ name: "x", colors: ["#000000", "red"] }),
    ).rejects.toMatchObject({ code: "failed" });
    expect((await store.loadPalettes()).palettes).toEqual([]);
  });

  it("updates, sets the default, removes and restores", async () => {
    const a = await store.createPalette({ name: "A", colors: ["#000000", "#ffffff"] });
    const b = await store.createPalette({ name: "B", colors: ["#111111", "#222222"] });
    clock = 5_000;
    const updated = await store.updatePalette(a.id, { name: "A2", colors: ["#333333", "#444444"] });
    expect(updated).toMatchObject({ name: "A2", createdAt: 1_000, updatedAt: 5_000 });
    await expect(
      store.updatePalette("missing", { name: "x", colors: ["#000000", "#000000"] }),
    ).rejects.toMatchObject({ code: "not-found" });

    await store.setDefaultPalette(b.id);
    expect((await store.loadPalettes()).defaultId).toBe(b.id);
    await expect(store.setDefaultPalette("missing")).rejects.toMatchObject({ code: "not-found" });

    // Removing the default moves the mark to the oldest remaining palette.
    await store.removePalette(b.id);
    expect(await store.loadPalettes()).toMatchObject({ defaultId: a.id });
    await store.restorePalette(b, true);
    expect((await store.loadPalettes()).defaultId).toBe(b.id);
    await store.removePalette(a.id);
    await store.removePalette(b.id);
    expect(await store.loadPalettes()).toEqual({ palettes: [], defaultId: null });
  });

  it("stops at the palette limit", async () => {
    for (let i = 0; i < BRAND_PALETTES_MAX; i++) {
      await store.createPalette({ name: `P${i}`, colors: ["#000000", "#ffffff"] });
    }
    await expect(
      store.createPalette({ name: "too many", colors: ["#000000", "#ffffff"] }),
    ).rejects.toMatchObject({ code: "limit" });
  });

  it("skips broken records and a dangling default mark", async () => {
    await store.createPalette({ name: "ok", colors: ["#000000", "#ffffff"] });
    const db = await openDatabase(factory);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE.brandPalettes, STORE.meta], "readwrite");
      tx.objectStore(STORE.brandPalettes).put({ id: "evil", name: 1, colors: "<script>" });
      tx.objectStore(STORE.meta).put({ key: DEFAULT_PALETTE_KEY, value: "gone" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const { palettes, defaultId } = await store.loadPalettes();
    expect(palettes.map((p) => p.id)).toEqual(["b1"]);
    expect(defaultId).toBe("b1");
  });
});

describe("brand assets", () => {
  it("adds, lists by kind, renames, removes and restores", async () => {
    const logo = await store.addAsset({ kind: "logo", name: "Logo", image: svg() });
    const raster = await store.addAsset({
      kind: "logo",
      name: "Logo PNG",
      image: { kind: "raster", href: PNG_1PX, width: 1, height: 1, name: "a.png" },
    });
    const shape = await store.addAsset({
      kind: "shape",
      name: "Stern",
      image: svg("<circle r='3'/>"),
    });
    expect((await store.listAssets("logo")).map((a) => a.id)).toEqual([logo.id, raster.id]);
    expect((await store.listAssets("shape")).map((a) => a.id)).toEqual([shape.id]);
    await store.renameAsset(shape.id, " Stern 2 ");
    expect((await store.getAsset(shape.id))?.name).toBe("Stern 2");
    await store.removeAsset(logo.id);
    expect(await store.getAsset(logo.id)).toBeNull();
    await store.restoreAsset(logo);
    expect((await store.listAssets()).length).toBe(3);
  });

  it("refuses raster shapes, malformed images and full lists", async () => {
    await expect(
      store.addAsset({
        kind: "shape",
        name: "x",
        image: { kind: "raster", href: PNG_1PX, width: 1, height: 1, name: "a.png" },
      }),
    ).rejects.toMatchObject({ code: "failed" });
    await expect(
      store.addAsset({
        kind: "logo",
        name: "x",
        image: { kind: "raster", href: "javascript:alert(1)", width: 1, height: 1, name: "" },
      }),
    ).rejects.toMatchObject({ code: "failed" });
    for (let i = 0; i < BRAND_LOGOS_MAX; i++) {
      await store.addAsset({ kind: "logo", name: `L${i}`, image: svg() });
    }
    await expect(store.addAsset({ kind: "logo", name: "x", image: svg() })).rejects.toMatchObject({
      code: "limit",
    });
    // Shapes have their own limit.
    await expect(store.addAsset({ kind: "shape", name: "s", image: svg() })).resolves.toBeTruthy();
  });
});

describe("brand kit import", () => {
  const palette = (over: Partial<BrandPalette> = {}): BrandPalette => ({
    id: "p1",
    name: "Import",
    colors: ["#010203", "#040506"],
    createdAt: 100,
    updatedAt: 200,
    ...over,
  });
  const asset = (over: Partial<BrandAsset> = {}): BrandAsset => ({
    id: "a1",
    kind: "logo",
    name: "Logo",
    image: svg(),
    createdAt: 100,
    ...over,
  });

  it("adds new entries, skips duplicates, renames id conflicts, adopts the default", async () => {
    const outcome = await store.importBrandKit({
      palettes: [palette(), palette({ id: "p2", name: "Zwei" })],
      assets: [asset()],
      defaultId: "p2",
    });
    expect(outcome).toEqual({ palettes: 2, assets: 1, fonts: 0, duplicates: 0, overLimit: 0 });
    expect((await store.loadPalettes()).defaultId).toBe("p2");

    const again = await store.importBrandKit({
      palettes: [palette(), palette({ name: "Andere" })],
      assets: [asset(), asset({ image: svg("<circle r='1'/>") })],
      defaultId: "p1",
    });
    expect(again).toEqual({ palettes: 1, assets: 1, fonts: 0, duplicates: 2, overLimit: 0 });
    const { palettes, defaultId } = await store.loadPalettes();
    expect(palettes.map((p) => p.id).sort()).toEqual(["b1", "p1", "p2"]);
    // An existing default is kept.
    expect(defaultId).toBe("p2");
    expect((await store.listAssets()).map((a) => a.id).sort()).toEqual(["a1", "b2"]);
  });

  it("caps future timestamps", async () => {
    clock = 5_000;
    await store.importBrandKit({
      palettes: [palette({ createdAt: 9_000_000_000_000, updatedAt: 9_000_000_000_000 })],
      assets: [],
      defaultId: null,
    });
    const [p] = (await store.loadPalettes()).palettes;
    expect(p).toMatchObject({ createdAt: 5_000, updatedAt: 5_000 });
  });

  it("returns everything for the export", async () => {
    await store.createPalette({ name: "A", colors: ["#000000", "#ffffff"] });
    await store.addAsset({ kind: "shape", name: "S", image: svg() });
    const all = await store.getAll();
    expect(all.palettes).toHaveLength(1);
    expect(all.assets).toHaveLength(1);
    expect(all.defaultId).toBe(all.palettes[0]?.id);
  });
});

describe("database upgrade", () => {
  /** Creates a database exactly as version 1 (M3-AP03) left it, with data. */
  async function createVersion1(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(STORE.designs, { keyPath: "id" });
        db.createObjectStore(STORE.designParams, { keyPath: "id" });
        db.createObjectStore(STORE.drafts, { keyPath: "toolId" });
        db.createObjectStore(STORE.meta, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction([STORE.designs, STORE.designParams, STORE.meta], "readwrite");
        tx.objectStore(STORE.designs).put({
          id: "old",
          toolId: "blob",
          toolVersion: 1,
          name: "Altes Design",
          seed: 7,
          size: { width: 1080, height: 1080 },
          createdAt: 10,
          updatedAt: 20,
          thumbnail: null,
        });
        tx.objectStore(STORE.designParams).put({ id: "old", params: { palette: ["#000000"] } });
        tx.objectStore(STORE.meta).put({ key: "persist-requested", value: true });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  it("keeps version 1 data and adds the brand kit stores", async () => {
    await createVersion1();
    expect(DB_VERSION).toBe(4);
    const db = await openDatabase(factory);
    expect(db.version).toBe(4);
    expect([...db.objectStoreNames].sort()).toEqual(
      [
        STORE.brandAssets,
        STORE.brandFonts,
        STORE.brandPalettes,
        STORE.designParams,
        STORE.designs,
        STORE.drafts,
        STORE.meta,
        STORE.socialDesigns,
        STORE.socialDrafts,
        STORE.socialScenes,
      ].sort(),
    );
    db.close();
    const designs = createDesignStore({ indexedDB: factory, persist: async () => true });
    const old = await designs.get("old");
    expect(old).toMatchObject({ name: "Altes Design", params: { palette: ["#000000"] } });
    // The persistence flag survived too: no second request.
    expect(await designs.requestPersistence()).toBeNull();
    designs.close();
    await store.createPalette({ name: "Neu", colors: ["#000000", "#ffffff"] });
    expect((await store.loadPalettes()).palettes).toHaveLength(1);
  });

  it("upgrades while another connection waits for version 1 to close", async () => {
    await createVersion1();
    const oldDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // An old tab closes its connection when asked (as our stores do).
    oldDb.onversionchange = () => oldDb.close();
    await expect(store.loadPalettes()).resolves.toEqual({ palettes: [], defaultId: null });
  });
});

describe("helpers", () => {
  it("normalises names and colours", () => {
    expect(normalizeBrandName(" a\u0000b ")).toBe("a b");
    expect(normalizeBrandName("x".repeat(200))).toHaveLength(80);
    expect(normalizeBrandHex("#ABC")).toBe("#aabbcc");
    expect(normalizeBrandHex(" #A1B2C3 ")).toBe("#a1b2c3");
    expect(normalizeBrandHex("rgb(0,0,0)")).toBeNull();
    expect(normalizeBrandHex("#abcd")).toBeNull();
  });
});
