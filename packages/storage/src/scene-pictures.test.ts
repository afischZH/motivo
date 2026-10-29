import {
  createBackgroundLayer,
  createImageLayer,
  createLogoLayer,
  createScene,
  type Scene,
} from "@musterli/scene";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORE, openDatabase, transact } from "./idb";
import {
  PICTURE_BLOB_MIN_LENGTH,
  clearPictureBlobs,
  packScene,
  pictureBlob,
  unpackScene,
} from "./scene-pictures";
import { createSocialDesignStore, type SocialDesignStore } from "./social";

const big = (c: string) => `data:image/png;base64,${c.repeat(PICTURE_BLOB_MIN_LENGTH + 1000)}`;
const small = "data:image/png;base64,AAAA";
const svg = `<svg xmlns="http://www.w3.org/2000/svg">${"<g/>".repeat(PICTURE_BLOB_MIN_LENGTH / 4 + 10)}</svg>`;

function pictureScene(): Scene {
  const s = createScene("square");
  const raster = (href: string, name: string) =>
    ({ kind: "raster", href, width: 100, height: 80, name }) as const;
  return {
    ...s,
    layers: [
      createBackgroundLayer("bg", s.format, { id: "blob", version: 1, params: {} }, 3),
      createImageLayer("i1", s.format, raster(big("A"), "a.png")),
      createImageLayer("i2", s.format, raster(small, "b.png")),
      createLogoLayer("l1", s.format, { kind: "svg", svg, width: 10, height: 10, name: "l" }, null),
    ],
  };
}

type Picture = { image: { href?: unknown; svg?: unknown } };
const picture = (scene: unknown, index: number) =>
  (scene as { layers: Picture[] }).layers[index]?.image;

let factory: IDBFactory;
let store: SocialDesignStore;

beforeEach(() => {
  clearPictureBlobs();
  factory = new IDBFactory();
  store = createSocialDesignStore({ indexedDB: factory, randomId: () => "s1" });
});

afterEach(() => store.close());

async function rawRecord(name: string, id: string): Promise<unknown> {
  const db = await openDatabase(factory);
  try {
    return await transact(db, name as typeof STORE.socialScenes, "readonly", (tx) => {
      const request = tx.objectStore(name).get(id);
      return () => request.result as unknown;
    });
  } finally {
    db.close();
  }
}

describe("scene pictures", () => {
  it("packs large picture data as Blobs and leaves the rest as is", async () => {
    const scene = pictureScene();
    const packed = await packScene(scene);
    expect(picture(packed, 1)?.href).toBeInstanceOf(Blob);
    expect(picture(packed, 2)?.href).toBe(small);
    expect(picture(packed, 3)?.svg).toBeInstanceOf(Blob);
    expect((packed as Scene).layers[0]).toBe(scene.layers[0]);
    expect(await unpackScene(packed)).toEqual(scene);
  });

  it("makes each Blob once, also for strings read back from one", async () => {
    const text = big("B");
    const a = await pictureBlob(text);
    expect(await pictureBlob(text)).toBe(a);
    expect(await pictureBlob(`${text}`)).toBe(a);

    clearPictureBlobs();
    const stored = await packScene(pictureScene());
    clearPictureBlobs();
    const read = await unpackScene(stored);
    const again = await packScene(read as Scene);
    expect(picture(again, 1)?.href).toBe(picture(stored, 1)?.href);
  });

  it("splits long strings into chunks without changing them", async () => {
    const text = big("C").repeat(40); // over 1 MB
    expect(text.length).toBeGreaterThan(1 << 20);
    expect(await (await pictureBlob(text)).text()).toBe(text);
  });

  it("passes on what does not look like a packed scene", async () => {
    expect(await unpackScene(null)).toBeNull();
    const odd = { layers: [null, { image: "x" }, { image: { kind: "raster", href: 3 } }] };
    expect(await unpackScene(odd)).toBe(odd);
  });
});

describe("social designs with pictures", () => {
  it("stores pictures of designs and drafts as Blobs and reads them back", async () => {
    const scene = pictureScene();
    const saved = await store.create({ name: "Bilder", scene, edited: true });
    expect(
      picture(((await rawRecord(STORE.socialScenes, "s1")) as { scene: unknown }).scene, 1)?.href,
    ).toBeInstanceOf(Blob);
    expect((await store.get(saved.id))?.scene).toEqual(scene);
    expect((await store.getAll())[0]?.scene).toEqual(scene);

    await store.putDraft(
      { designId: null, name: "Entwurf", scene, updatedAt: 5 },
      { edited: true },
    );
    const draft = (await rawRecord(STORE.socialDrafts, "current")) as { scene: unknown };
    expect(picture(draft.scene, 3)?.svg).toBeInstanceOf(Blob);
    expect((await store.getDraft())?.scene).toEqual(scene);
  });

  it("still reads scenes stored with picture strings", async () => {
    const scene = pictureScene();
    const db = await openDatabase(factory);
    await transact(db, STORE.socialDrafts, "readwrite", (tx) => {
      tx.objectStore(STORE.socialDrafts).put({
        id: "current",
        designId: null,
        name: "Alt",
        scene,
        updatedAt: 1,
      });
      return () => undefined;
    });
    db.close();
    expect((await store.getDraft())?.scene).toEqual(scene);
  });

  it("leaves out a stored scene whose picture Blob is not valid picture data", async () => {
    await store.create({ name: "Bilder", scene: pictureScene() });
    const db = await openDatabase(factory);
    await transact(db, STORE.socialScenes, "readwrite", (tx) => {
      const scenes = tx.objectStore(STORE.socialScenes);
      const request = scenes.get("s1");
      request.onsuccess = () => {
        const record = request.result as { scene: { layers: Picture[] } };
        const layer = record.scene.layers[1];
        if (layer) layer.image.href = new Blob(["javascript:alert(1)"]);
        scenes.put(record);
      };
      return () => undefined;
    });
    db.close();
    expect(await store.get("s1")).toBeNull();
    expect(await store.getAll()).toEqual([]);
  });

  it("packs imported designs too", async () => {
    const scene = pictureScene();
    await store.importDesigns([{ id: "imp", name: "Import", scene, createdAt: 1, updatedAt: 1 }]);
    const raw = (await rawRecord(STORE.socialScenes, "imp")) as { scene: unknown };
    expect(picture(raw.scene, 1)?.href).toBeInstanceOf(Blob);
    expect((await store.get("imp"))?.scene).toEqual(scene);
  });
});
