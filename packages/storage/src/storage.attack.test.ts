/**
 * Robustness tests for the IndexedDB layer (M3-AP11 security review):
 * tampered records, a full disk and other tabs must never break a page or
 * let malformed data through.
 */
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBrandKitStore } from "./brand-kit";
import { createDesignStore } from "./designs";
import { DB_NAME, STORE, StorageError, openDatabase, transact } from "./idb";

let factory: IDBFactory;
const closers: (() => void)[] = [];

beforeEach(() => {
  factory = new IDBFactory();
});

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function putRaw(store: string, value: unknown): Promise<void> {
  const db = await openDatabase(factory);
  await transact(db, store as typeof STORE.designs, "readwrite", (tx) => {
    tx.objectStore(store).put(value);
    return () => undefined;
  });
  db.close();
}

const design = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  toolId: "blob",
  toolVersion: 1,
  name: "Blob",
  seed: 1,
  size: { width: 100, height: 100 },
  createdAt: 1,
  updatedAt: 2,
  thumbnail: null,
  ...over,
});

describe("tampered records", () => {
  it("drops extra fields and rejects wrong types on read", async () => {
    await putRaw(STORE.designs, design({ evil: "<img src=x onerror=alert(1)>" }));
    await putRaw(STORE.designs, design({ id: "d2", name: { toString: "x" } }));
    await putRaw(STORE.designs, design({ id: "d3", size: { width: 1e9, height: 1 } }));
    await putRaw(STORE.designs, design({ id: "d4", toolId: "../x" }));
    await putRaw(
      STORE.designs,
      design({ id: "d5", thumbnail: { type: "text/html", bytes: new ArrayBuffer(4) } }),
    );
    await putRaw(STORE.designParams, { id: "d1", params: [1, 2] });
    const designs = createDesignStore({ indexedDB: factory });
    closers.push(designs.close);
    const list = await designs.list();
    expect(list.map((d) => d.id)).toEqual(["d1"]);
    expect(list[0]).not.toHaveProperty("evil");
    // Params that are not a plain object make the design unreadable, not the page.
    expect(await designs.get("d1")).toBeNull();
    expect(await designs.getAll()).toEqual([]);
  });

  it("ignores tampered drafts and brand records", async () => {
    await putRaw(STORE.drafts, { toolId: "blob", params: "x" });
    await putRaw(STORE.brandPalettes, {
      id: "p",
      name: "P",
      colors: ["red", "url(javascript:alert(1))"],
      createdAt: 1,
      updatedAt: 1,
    });
    await putRaw(STORE.brandAssets, {
      id: "a",
      kind: "shape",
      name: "A",
      image: { kind: "raster", href: "data:image/png;base64,AAAA", width: 1, height: 1, name: "" },
      createdAt: 1,
    });
    await putRaw(STORE.brandAssets, {
      id: "b",
      kind: "logo",
      name: "B",
      image: { kind: "raster", href: "javascript:alert(1)", width: 1, height: 1, name: "" },
      createdAt: 1,
    });
    await putRaw(STORE.meta, { key: "brand-default-palette", value: { evil: true } });
    const designs = createDesignStore({ indexedDB: factory });
    const brand = createBrandKitStore({ indexedDB: factory });
    closers.push(designs.close, brand.close);
    expect(await designs.getDraft("blob")).toBeNull();
    expect(await brand.loadPalettes()).toEqual({ palettes: [], defaultId: null });
    expect(await brand.listAssets()).toEqual([]);
  });
});

describe("storage errors", () => {
  it("reports a full disk as quota, also when the browser aborts the transaction", async () => {
    const db = await openDatabase(factory);
    // Synchronous refusal inside the transaction body.
    await expect(
      transact(db, STORE.meta, "readwrite", () => {
        throw new DOMException("full", "QuotaExceededError");
      }),
    ).rejects.toMatchObject({ code: "quota" });
    db.close();

    // Asynchronous abort with the quota error (how browsers report it).
    const handlers: { oncomplete?: () => void; onabort?: () => void } = {};
    const tx = {
      error: new DOMException("full", "QuotaExceededError"),
      abort: () => undefined,
      set oncomplete(fn: () => void) {
        handlers.oncomplete = fn;
      },
      set onabort(fn: () => void) {
        handlers.onabort = fn;
      },
    };
    const fakeDb = { transaction: () => tx } as unknown as IDBDatabase;
    const pending = transact(fakeDb, STORE.designs, "readwrite", () => () => "done");
    handlers.onabort?.();
    const error: unknown = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).code).toBe("quota");
  });

  it("does not store anything of an import that fails half way", async () => {
    const designs = createDesignStore({ indexedDB: factory, now: () => 10 });
    closers.push(designs.close);
    const ok = {
      id: "a",
      toolId: "blob",
      toolVersion: 1,
      name: "A",
      params: {},
      seed: 1,
      size: { width: 100, height: 100 },
      createdAt: 1,
      updatedAt: 1,
    };
    // The second design is invalid (validated inside the transaction).
    await expect(
      designs.importDesigns([ok, { ...ok, id: "b", size: { width: 1, height: 1 } }]),
    ).rejects.toBeInstanceOf(StorageError);
    expect(await designs.list()).toEqual([]);
  });
});

describe("other tabs", () => {
  it("gives way to a newer version opened in another tab", async () => {
    const designs = createDesignStore({ indexedDB: factory });
    closers.push(designs.close);
    expect(await designs.list()).toEqual([]);
    // A newer Musterli in another tab upgrades the database; ours must not block it.
    const newer = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, 99);
      request.onblocked = () => reject(new Error("blocked by our connection"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    newer.close();
    // This (now outdated) tab fails cleanly instead of hanging.
    await expect(designs.list()).rejects.toBeInstanceOf(StorageError);
  });

  it("sees what another tab wrote", async () => {
    const a = createBrandKitStore({ indexedDB: factory });
    const b = createBrandKitStore({ indexedDB: factory });
    closers.push(a.close, b.close);
    await a.createPalette({ name: "A", colors: ["#000000", "#ffffff"] });
    await b.createPalette({ name: "B", colors: ["#000000", "#ffffff"] });
    expect((await a.loadPalettes()).palettes.map((p) => p.name)).toEqual(["A", "B"]);
  });
});
