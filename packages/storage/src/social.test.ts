import { createBackgroundLayer, createScene, createTextLayer, type Scene } from "@musterli/scene";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBrandKitStore } from "./brand-kit";
import { createDesignStore } from "./designs";
import { DB_NAME, DB_VERSION, STORE, openDatabase, transact } from "./idb";
import { createSocialDesignStore, type SocialDesignStore } from "./social";

let factory: IDBFactory;
let clock: number;
let ids: number;
let store: SocialDesignStore;

function scene(text = "Hallo"): Scene {
  const s = createScene("square");
  return {
    ...s,
    layers: [
      createBackgroundLayer("bg", s.format, { id: "blob", version: 1, params: {} }, 3),
      createTextLayer("t1", s.format, text),
    ],
  };
}

beforeEach(() => {
  factory = new IDBFactory();
  clock = 1_000;
  ids = 0;
  store = createSocialDesignStore({
    indexedDB: factory,
    now: () => clock,
    randomId: () => `s${++ids}`,
  });
});

afterEach(() => store.close());

describe("social designs", () => {
  it("creates, lists, updates, renames, duplicates, removes and restores", async () => {
    const thumb = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
    const a = await store.create({ name: " Post\n1 ", scene: scene(), thumbnail: thumb });
    expect(a).toMatchObject({ id: "s1", name: "Post 1", format: { id: "square", width: 1080 } });
    clock = 2_000;
    const b = await store.create({ name: "Story", scene: scene("Zwei") });
    expect((await store.list()).map((d) => d.id)).toEqual(["s2", "s1"]);
    expect((await store.list())[1]?.thumbnail?.size).toBe(3);

    clock = 3_000;
    const changed = await store.update(a.id, { name: "Post 1b", scene: scene("Neu") });
    expect(changed.createdAt).toBe(1_000);
    expect(changed.updatedAt).toBe(3_000);
    // The thumbnail stays when none is given.
    expect(changed.thumbnail?.size).toBe(3);
    const loaded = await store.get(a.id);
    expect(loaded?.scene.layers[1]).toMatchObject({ kind: "text", text: "Neu" });

    await store.rename(b.id, "Story 2");
    expect((await store.get(b.id))?.name).toBe("Story 2");
    const copy = await store.duplicate(a.id, "Kopie");
    expect(copy).toMatchObject({ id: "s3", name: "Kopie" });
    expect(copy.thumbnail?.size).toBe(3);

    const removed = await store.get(b.id);
    await store.remove(b.id);
    expect(await store.get(b.id)).toBeNull();
    if (!removed) throw new Error("missing");
    await store.restore(removed);
    expect((await store.get(b.id))?.name).toBe("Story 2");
    expect(await store.getAll()).toHaveLength(3);

    await expect(store.update("nope", { name: "x", scene: scene() })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(store.rename("nope", "x")).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses invalid scenes", async () => {
    const bad = { ...scene(), version: 9 } as unknown as Scene;
    await expect(store.create({ name: "x", scene: bad })).rejects.toMatchObject({ code: "failed" });
    expect(await store.list()).toEqual([]);
  });

  it("keeps one draft", async () => {
    expect(await store.getDraft()).toBeNull();
    await store.putDraft({ designId: null, name: "Entwurf", scene: scene(), updatedAt: 5 });
    await store.putDraft({ designId: "s1", name: "Entwurf 2", scene: scene("B"), updatedAt: 6 });
    expect(await store.getDraft()).toMatchObject({
      designId: "s1",
      name: "Entwurf 2",
      updatedAt: 6,
    });
    await store.deleteDraft();
    expect(await store.getDraft()).toBeNull();
  });

  it("imports with new ids on conflicts and skips exact duplicates", async () => {
    const a = await store.create({ name: "A", scene: scene() });
    const outcome = await store.importDesigns([
      { id: a.id, name: "A", scene: scene(), createdAt: a.createdAt, updatedAt: a.updatedAt },
      { id: a.id, name: "Andere", scene: scene("X"), createdAt: 1, updatedAt: 2 },
      { id: "fresh", name: "Neu", scene: scene(), createdAt: 1, updatedAt: 9e12 },
    ]);
    expect(outcome.duplicates).toBe(1);
    expect(outcome.added).toEqual(["s2", "fresh"]);
    // Timestamps from the future are capped.
    expect((await store.get("fresh"))?.updatedAt).toBe(1_000);
  });

  it("leaves tampered records out", async () => {
    await store.create({ name: "Gut", scene: scene() });
    const db = await openDatabase(factory);
    await transact(db, [STORE.socialDesigns, STORE.socialScenes], "readwrite", (tx) => {
      tx.objectStore(STORE.socialDesigns).put({ id: "evil", name: 5 });
      tx.objectStore(STORE.socialDesigns).put({
        id: "s9",
        name: "Ohne Szene",
        format: { id: null, width: 100, height: 100 },
        createdAt: 1,
        updatedAt: 1,
        thumbnail: null,
      });
      tx.objectStore(STORE.socialScenes).put({ id: "s9", scene: { version: 1, layers: "x" } });
      return () => undefined;
    });
    db.close();
    expect((await store.list()).map((d) => d.name)).toEqual(["Gut", "Ohne Szene"]);
    expect(await store.get("s9")).toBeNull();
    expect(await store.getAll()).toHaveLength(1);
  });
});

describe("database upgrade to version 3", () => {
  /** Creates a database exactly as version 2 (M3-AP05) left it, with real data. */
  async function createVersion2(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of [
          STORE.designs,
          STORE.designParams,
          STORE.brandPalettes,
          STORE.brandAssets,
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
            STORE.designs,
            STORE.designParams,
            STORE.drafts,
            STORE.meta,
            STORE.brandPalettes,
            STORE.brandAssets,
          ],
          "readwrite",
        );
        tx.objectStore(STORE.designs).put({
          id: "old",
          toolId: "mesh-gradient",
          toolVersion: 1,
          name: "Mein Verlauf",
          seed: 42,
          size: { width: 1920, height: 1080 },
          createdAt: 10,
          updatedAt: 20,
          thumbnail: { type: "image/png", bytes: new Uint8Array([137, 80, 78, 71]).buffer },
        });
        tx.objectStore(STORE.designParams).put({
          id: "old",
          params: { palette: ["#112233", "#445566"], blur: 120 },
        });
        tx.objectStore(STORE.drafts).put({
          toolId: "blob",
          toolVersion: 1,
          designId: null,
          name: "Entwurf",
          params: { complexity: 5 },
          seed: 7,
          size: { width: 1080, height: 1080 },
          updatedAt: 30,
        });
        tx.objectStore(STORE.meta).put({ key: "persist-requested", value: true });
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
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  it("keeps every version 2 record and adds the social stores", async () => {
    await createVersion2();
    expect(DB_VERSION).toBe(3);
    const db = await openDatabase(factory);
    expect(db.version).toBe(3);
    for (const name of [STORE.socialDesigns, STORE.socialScenes, STORE.socialDrafts]) {
      expect(db.objectStoreNames.contains(name), name).toBe(true);
    }
    db.close();

    const designs = createDesignStore({ indexedDB: factory, persist: async () => true });
    const old = await designs.get("old");
    expect(old).toMatchObject({
      toolId: "mesh-gradient",
      name: "Mein Verlauf",
      seed: 42,
      params: { palette: ["#112233", "#445566"], blur: 120 },
    });
    expect(old?.thumbnail?.size).toBe(4);
    expect(await designs.getDraft("blob")).toMatchObject({ seed: 7, params: { complexity: 5 } });
    expect(await designs.requestPersistence()).toBeNull();
    designs.close();

    const brand = createBrandKitStore({ indexedDB: factory });
    expect(await brand.loadPalettes()).toMatchObject({
      defaultId: "p1",
      palettes: [{ id: "p1", name: "Hausfarben", colors: ["#000000", "#ff6600"] }],
    });
    expect(await brand.listAssets("logo")).toHaveLength(1);
    brand.close();

    // The new stores work on the upgraded database.
    expect(await store.list()).toEqual([]);
    await store.create({ name: "Erster Post", scene: scene() });
    expect(await store.list()).toHaveLength(1);
  });

  it("upgrades while an old tab holds version 2 open (and lets go)", async () => {
    await createVersion2();
    const oldDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    oldDb.onversionchange = () => oldDb.close();
    await expect(store.list()).resolves.toEqual([]);
  });
});
