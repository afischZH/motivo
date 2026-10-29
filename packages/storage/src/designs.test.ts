import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDesignStore,
  normalizeDesignName,
  type DesignInput,
  type DesignStore,
} from "./designs";
import { DB_NAME, STORE, StorageError, openDatabase } from "./idb";
import { DESIGN_NAME_MAX } from "./schema";

let factory: IDBFactory;
let clock: number;
let ids: number;
let store: DesignStore;

const input = (over: Partial<DesignInput> = {}): DesignInput => ({
  toolId: "blob",
  toolVersion: 1,
  name: "Mein Blob",
  params: { background: "#ffffff", palette: ["#000000", "#ff0000"] },
  seed: 42,
  size: { width: 1080, height: 1080 },
  ...over,
});

const webp = (bytes = 10) => new Blob([new Uint8Array(bytes).fill(7)], { type: "image/webp" });

beforeEach(() => {
  factory = new IDBFactory();
  clock = 1_000;
  ids = 0;
  store = createDesignStore({
    indexedDB: factory,
    now: () => clock,
    randomId: () => `id${++ids}`,
    persist: async () => true,
  });
});

afterEach(() => store.close());

describe("design store", () => {
  it("creates, lists and reads designs", async () => {
    const a = await store.create(input({ thumbnail: webp() }));
    clock = 2_000;
    const b = await store.create(input({ name: "Zweites", toolId: "svg-waves" }));
    expect(a.id).toBe("id1");
    const list = await store.list();
    expect(list.map((d) => d.id)).toEqual([b.id, a.id]);
    expect(list[1]?.thumbnail?.type).toBe("image/webp");
    expect(list[1]?.thumbnail?.size).toBe(10);
    // The overview does not carry params.
    expect(list[0]).not.toHaveProperty("params");
    const read = await store.get(a.id);
    expect(read?.params).toEqual(input().params);
    expect(read?.createdAt).toBe(1_000);
    expect(await store.get("missing")).toBeNull();
  });

  it("updates content and keeps createdAt", async () => {
    const a = await store.create(input({ thumbnail: webp() }));
    clock = 5_000;
    const updated = await store.update(a.id, input({ seed: 7, name: "Neu" }));
    expect(updated).toMatchObject({
      id: a.id,
      seed: 7,
      name: "Neu",
      createdAt: 1_000,
      updatedAt: 5_000,
    });
    // Without a new thumbnail the old one stays.
    expect((await store.get(a.id))?.thumbnail?.size).toBe(10);
    await expect(store.update("nope", input())).rejects.toMatchObject({ code: "not-found" });
  });

  it("renames, duplicates and removes", async () => {
    const a = await store.create(input({ thumbnail: webp(3) }));
    clock = 2_000;
    await store.rename(a.id, "  Umbenannt\n ");
    expect((await store.get(a.id))?.name).toBe("Umbenannt");
    const copy = await store.duplicate(a.id, "Kopie");
    expect(copy.id).not.toBe(a.id);
    expect(copy.params).toEqual(a.params);
    expect(copy.thumbnail?.size).toBe(3);
    await store.remove(a.id);
    expect(await store.get(a.id)).toBeNull();
    expect((await store.list()).map((d) => d.id)).toEqual([copy.id]);
    await expect(store.rename(a.id, "x")).rejects.toMatchObject({ code: "not-found" });
  });

  it("restores a removed design unchanged (undo)", async () => {
    const a = await store.create(input({ thumbnail: webp() }));
    const full = await store.get(a.id);
    await store.remove(a.id);
    if (!full) throw new Error("missing");
    await store.restore(full);
    expect(await store.get(a.id)).toEqual(full);
  });

  it("sets thumbnails without changing the order", async () => {
    const a = await store.create(input());
    clock = 9_000;
    await store.setThumbnail(a.id, webp(5));
    const read = await store.get(a.id);
    expect(read?.thumbnail?.size).toBe(5);
    expect(read?.updatedAt).toBe(1_000);
    // Unknown types and oversized blobs are not stored.
    await store.setThumbnail(a.id, new Blob(["<svg/>"], { type: "image/svg+xml" }));
    expect((await store.get(a.id))?.thumbnail).toBeNull();
  });

  it("rejects invalid designs instead of storing them", async () => {
    await expect(store.create(input({ toolId: "Bad Tool" }))).rejects.toBeInstanceOf(StorageError);
    await expect(store.create(input({ seed: -1 }))).rejects.toBeInstanceOf(StorageError);
    await expect(
      store.create(input({ params: [] as unknown as Record<string, unknown> })),
    ).rejects.toBeInstanceOf(StorageError);
    expect(await store.list()).toEqual([]);
  });

  it("skips broken records written by hand", async () => {
    await store.create(input());
    const db = await openDatabase(factory);
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE.designs], "readwrite");
      tx.objectStore(STORE.designs).put({ id: "evil", toolId: 5 });
      tx.oncomplete = () => resolve();
    });
    db.close();
    expect((await store.list()).map((d) => d.id)).toEqual(["id1"]);
    expect(await store.get("evil")).toBeNull();
  });

  it("imports designs, skips exact duplicates and renames clashing ids", async () => {
    const a = await store.create(input());
    const result = await store.importDesigns([
      // Same design, same version: duplicate.
      { ...a, params: a.params },
      // Same id, another version: imported under a new id.
      { ...a, updatedAt: 1_500, seed: 9 },
      { ...a, id: "fresh", name: "Frisch" },
    ]);
    expect(result.duplicates).toBe(1);
    expect(result.added).toHaveLength(2);
    expect(result.added).toContain("fresh");
    expect(result.added).not.toContain(a.id);
    expect(await store.list()).toHaveLength(3);
  });

  it("keeps imported timestamps but never in the future", async () => {
    clock = 10_000;
    const { added } = await store.importDesigns([
      { ...input(), id: "x", createdAt: 500, updatedAt: 99_999 },
    ]);
    const read = await store.get(String(added[0]));
    expect(read).toMatchObject({ createdAt: 500, updatedAt: 10_000, thumbnail: null });
  });

  it("keeps one draft per tool", async () => {
    expect(await store.getDraft("blob")).toBeNull();
    const draft = {
      toolId: "blob",
      toolVersion: 1,
      designId: null,
      name: "",
      params: { a: 1 },
      seed: 1,
      size: { width: 100, height: 100 },
      updatedAt: 1,
    };
    await store.putDraft(draft);
    await store.putDraft({ ...draft, seed: 2 });
    expect((await store.getDraft("blob"))?.seed).toBe(2);
    await store.deleteDraft("blob");
    expect(await store.getDraft("blob")).toBeNull();
  });

  it("asks for persistent storage only once", async () => {
    const persist = vi.fn(async () => true);
    const s = createDesignStore({ indexedDB: factory, persist });
    expect(await s.requestPersistence()).toBe(true);
    expect(await s.requestPersistence()).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
    s.close();
  });

  it("reports a missing IndexedDB as unavailable", async () => {
    const s = createDesignStore({ indexedDB: undefined as unknown as IDBFactory });
    vi.stubGlobal("indexedDB", undefined);
    try {
      await expect(s.list()).rejects.toMatchObject({ code: "unavailable" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports a failing open as unavailable and retries later", async () => {
    let fail = true;
    const flaky = {
      open: (name: string, version?: number) => {
        if (fail) throw new DOMException("denied", "SecurityError");
        return factory.open(name, version);
      },
    } as unknown as IDBFactory;
    const s = createDesignStore({ indexedDB: flaky });
    await expect(s.list()).rejects.toMatchObject({ code: "unavailable" });
    fail = false;
    expect(await s.list()).toEqual([]);
    s.close();
  });

  it("uses one database with the documented stores", async () => {
    await store.list();
    const db = await openDatabase(factory, DB_NAME);
    expect([...db.objectStoreNames].sort()).toEqual(
      [
        "brand-assets",
        "brand-fonts",
        "brand-palettes",
        "design-params",
        "designs",
        "drafts",
        "meta",
        "social-designs",
        "social-drafts",
        "social-scenes",
      ].sort(),
    );
    db.close();
  });
});

describe("normalizeDesignName", () => {
  it("trims, strips control characters and limits the length", () => {
    expect(normalizeDesignName("  a\u0000b\tc  ")).toBe("a b c");
    expect(normalizeDesignName("x".repeat(500))).toHaveLength(DESIGN_NAME_MAX);
  });
});
