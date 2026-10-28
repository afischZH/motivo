import { createDesignStore, type DesignStore } from "@motivo/storage";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorStore, type EditorStoreApi } from "../store/editor-store";
import { createFixtureRegistry, fixtureTool } from "../test/fixture-tool";
import {
  createLocalDesignController,
  designIdFromHash,
  type LocalDesignController,
  type LocalDesignOptions,
} from "./local-design";

let factory: IDBFactory;
let designs: DesignStore;
let hash: string;
let timers: Map<number, () => void>;
let persist: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

const registry = createFixtureRegistry();

function editor(toolId = "test-fixture"): EditorStoreApi {
  return createEditorStore({ toolId, registry, randomSeed: () => 1234 });
}

function controller(
  store: EditorStoreApi,
  over: Partial<LocalDesignOptions> = {},
): LocalDesignController {
  let nextTimer = 1;
  return createLocalDesignController({
    store,
    designs,
    thumbnail: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }),
    defaultName: () => "Fixture vom 28.10.2026",
    location: {
      getHash: () => hash,
      replaceHash: (next) => {
        hash = next;
      },
    },
    setTimeout: (fn) => {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id as number),
    ...over,
  });
}

/** Runs pending debounce timers. */
function flushTimers() {
  const pending = [...timers.values()];
  timers.clear();
  for (const fn of pending) fn();
}

/** Lets IndexedDB callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function started(store: EditorStoreApi, over: Partial<LocalDesignOptions> = {}) {
  const c = controller(store, over);
  const stop = c.start();
  await vi.waitFor(() => expect(c.getView().ready).toBe(true));
  return { c, stop };
}

beforeEach(() => {
  factory = new IDBFactory();
  persist = vi.fn(async () => true);
  designs = createDesignStore({ indexedDB: factory, persist });
  hash = "";
  timers = new Map();
});

afterEach(() => designs.close());

describe("local design controller", () => {
  it("saves a new design, then updates it", async () => {
    const store = editor();
    const { c, stop } = await started(store);
    expect(c.getView()).toMatchObject({ designId: null, dirty: true });

    store.getState().setParam("count", 33);
    expect(await c.save()).toBe(true);
    const id = String(c.getView().designId);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toBe(`#design=${id}`);
    expect(c.getView()).toMatchObject({ name: "Fixture vom 28.10.2026", dirty: false });
    const saved = await designs.get(id);
    expect(saved?.params.count).toBe(33);
    expect(saved?.thumbnail?.type).toBe("image/webp");
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);

    store.getState().setParam("count", 12);
    expect(c.getView().dirty).toBe(true);
    c.setName("Mein Muster");
    expect(await c.save()).toBe(true);
    expect(c.getView().designId).toBe(id);
    expect((await designs.list()).map((d) => [d.id, d.name])).toEqual([[id, "Mein Muster"]]);
    expect((await designs.get(id))?.params.count).toBe(12);
    // Persistence is only requested on the first save.
    expect(persist).toHaveBeenCalledTimes(1);
    stop();
  });

  it("renames a saved design on commit", async () => {
    const store = editor();
    const { c, stop } = await started(store);
    await c.save();
    c.setName("Neuer Name");
    expect(c.getView().dirty).toBe(true);
    await c.commitName();
    expect(c.getView().dirty).toBe(false);
    expect((await designs.list())[0]?.name).toBe("Neuer Name");
    stop();
  });

  it("autosaves a draft after a pause and restores it on return", async () => {
    const store = editor();
    const { c, stop } = await started(store);
    store.getState().setParam("count", 44);
    c.setName("Entwurf");
    expect(timers.size).toBe(1);
    flushTimers();
    await settle();
    expect((await designs.getDraft("test-fixture"))?.params.count).toBe(44);
    stop();

    const again = editor();
    const { c: c2, stop: stop2 } = await started(again);
    expect(again.getState().params.count).toBe(44);
    expect(c2.getView()).toMatchObject({ name: "Entwurf", designId: null });
    expect(c2.getView().notice).toEqual({ kind: "draft-restored" });

    c2.startNew();
    expect(again.getState().params.count).toBe(10);
    expect(c2.getView()).toMatchObject({ notice: null, name: "" });
    await settle();
    expect(await designs.getDraft("test-fixture")).toBeNull();
    stop2();
  });

  it("writes a pending draft when stopped", async () => {
    const store = editor();
    const { stop } = await started(store);
    store.getState().setParam("count", 21);
    stop();
    await settle();
    expect((await designs.getDraft("test-fixture"))?.params.count).toBe(21);
  });

  it("does not restore a draft that is just the starting state", async () => {
    await designs.putDraft({
      toolId: "test-fixture",
      toolVersion: 1,
      designId: null,
      name: "",
      params: fixtureTool.defaults as Record<string, unknown>,
      seed: 1,
      size: { width: 1080, height: 1080 },
      updatedAt: 1,
    });
    const { c, stop } = await started(editor());
    expect(c.getView().notice).toBeNull();
    stop();
  });

  it("restores a draft linked to a saved design with its id", async () => {
    const store = editor();
    const { c, stop } = await started(store);
    await c.save();
    const id = c.getView().designId;
    store.getState().setParam("count", 5);
    stop();
    await settle();

    hash = "";
    const again = editor();
    const { c: c2, stop: stop2 } = await started(again);
    expect(c2.getView()).toMatchObject({ designId: id, dirty: true });
    expect(hash).toBe(`#design=${id}`);
    expect(again.getState().params.count).toBe(5);
    stop2();
  });

  it("opens #design=<id> and offers a newer draft of it", async () => {
    const store = editor();
    const { c, stop } = await started(store);
    store.getState().setParam("count", 30);
    await c.save();
    const id = String(c.getView().designId);
    store.getState().setParam("count", 31);
    stop();
    await settle();

    hash = `#design=${id}`;
    const again = editor();
    const { c: c2, stop: stop2 } = await started(again);
    expect(again.getState().params.count).toBe(30);
    expect(c2.getView()).toMatchObject({ designId: id, dirty: false });
    expect(c2.getView().notice).toEqual({ kind: "draft-available" });
    c2.restoreDraft();
    await vi.waitFor(() => expect(again.getState().params.count).toBe(31));
    expect(c2.getView()).toMatchObject({ designId: id, dirty: true, notice: null });
    stop2();
  });

  it("reports unknown ids and designs of another tool", async () => {
    hash = "#design=doesnotexist";
    const { c, stop } = await started(editor());
    expect(c.getView().notice).toEqual({ kind: "error", code: "not-found" });
    stop();

    const other = editor("test-other");
    const { c: o, stop: stopOther } = await started(other);
    await o.save();
    const id = String(o.getView().designId);
    stopOther();
    hash = `#design=${id}`;
    const { c: c2, stop: stop2 } = await started(editor());
    expect(c2.getView().notice).toEqual({ kind: "error", code: "other-tool" });
    stop2();
  });

  it("leaves a share link alone and only offers the draft", async () => {
    const store = editor();
    const { stop } = await started(store);
    store.getState().setParam("count", 44);
    stop();
    await settle();

    hash = "#d=somecode";
    const again = editor();
    again.getState().setParam("count", 7); // what the share hook loaded
    const { c, stop: stop2 } = await started(again);
    expect(again.getState().params.count).toBe(7);
    expect(c.getView().notice).toEqual({ kind: "draft-available" });
    c.dismissNotice();
    c.restoreDraft();
    await settle();
    expect(again.getState().params.count).toBe(7);
    stop2();
  });

  it("explains when the browser cannot store anything", async () => {
    designs = createDesignStore({
      indexedDB: {
        open: () => {
          throw new DOMException("no", "InvalidStateError");
        },
      } as unknown as IDBFactory,
    });
    const { c, stop } = await started(editor());
    expect(await c.save()).toBe(false);
    expect(c.getView().notice).toEqual({ kind: "error", code: "unavailable" });
    expect(c.getView().saving).toBe(false);
    stop();
  });

  it("saves without a thumbnail when none can be made", async () => {
    const { c, stop } = await started(editor(), {
      thumbnail: () => Promise.reject(new Error("no canvas")),
    });
    expect(await c.save()).toBe(true);
    expect((await designs.list())[0]?.thumbnail).toBeNull();
    stop();
  });
});

describe("designIdFromHash", () => {
  it("reads safe ids only", () => {
    expect(designIdFromHash("#design=abc_1-2")).toBe("abc_1-2");
    expect(designIdFromHash("#d=x&design=abc")).toBe("abc");
    expect(designIdFromHash("#d=xyz")).toBeNull();
    expect(designIdFromHash("#design=<script>")).toBeNull();
    expect(designIdFromHash("")).toBeNull();
  });
});
