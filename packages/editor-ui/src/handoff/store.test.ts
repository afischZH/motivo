import { describe, expect, it, vi } from "vitest";
import { IMAGE_INPUT_MAX_BYTES } from "../image-input/check";
import {
  HANDOFF_TTL_MS,
  createHandoffStore,
  handoffHash,
  handoffTokenFromHash,
  type HandoffEntry,
} from "./store";
import { hashWithoutHandoff } from "./use-handoff-receiver";

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const TOKEN = "0123456789abcdef0123456789abcdef";
const OTHER = "ffffffffffffffffffffffffffffffff";

const entry = (bytes: BlobPart[], over: Partial<HandoffEntry> = {}): HandoffEntry => ({
  sourceToolId: "mesh-gradient",
  toolId: "halftone",
  param: "photo",
  blob: new Blob(bytes),
  name: "musterli-mesh-gradient-1.png",
  ...over,
});
const png = () => entry([new Uint8Array([...PNG_HEAD, 1, 2, 3])]);

function setup() {
  let time = 1_000;
  const timers: { fn: () => void; at: number }[] = [];
  const tokens = [TOKEN, OTHER];
  const store = createHandoffStore({
    now: () => time,
    randomToken: () => tokens.shift() ?? TOKEN,
    setTimeout: (fn, ms) => {
      const timer = { fn, at: time + ms };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (handle) => {
      const i = timers.indexOf(handle as (typeof timers)[number]);
      if (i !== -1) timers.splice(i, 1);
    },
  });
  const advance = (ms: number) => {
    time += ms;
    for (const timer of [...timers]) {
      if (timer.at <= time) {
        timers.splice(timers.indexOf(timer), 1);
        timer.fn();
      }
    }
  };
  return { store, advance, timers };
}

describe("hand-over store", () => {
  it("hands a picture over exactly once, to the right tool", async () => {
    const { store } = setup();
    const put = await store.put(png());
    expect(put).toEqual({ ok: true, token: TOKEN });
    const taken = store.take(TOKEN, "halftone");
    expect(taken?.param).toBe("photo");
    expect(taken?.sourceToolId).toBe("mesh-gradient");
    expect(store.take(TOKEN, "halftone")).toBeNull();
    expect(store.size()).toBe(0);
  });

  it("gives nothing to another tool and forgets it after that attempt", async () => {
    const { store } = setup();
    await store.put(png());
    expect(store.take(TOKEN, "duotone")).toBeNull();
    expect(store.take(TOKEN, "halftone")).toBeNull();
  });

  it("ignores unknown and malformed tokens without losing the picture", async () => {
    const { store } = setup();
    await store.put(png());
    expect(store.take(OTHER, "halftone")).toBeNull();
    expect(store.take("../../etc", "halftone")).toBeNull();
    expect(store.take(TOKEN, "halftone")).not.toBeNull();
  });

  it("keeps one picture at a time: a newer hand-over replaces the older", async () => {
    const { store } = setup();
    await store.put(png());
    const second = await store.put(entry([new Uint8Array(JPEG_HEAD)], { toolId: "duotone" }));
    expect(second).toEqual({ ok: true, token: OTHER });
    expect(store.size()).toBe(1);
    expect(store.take(TOKEN, "halftone")).toBeNull();
    expect(store.take(OTHER, "duotone")).not.toBeNull();
  });

  it("cleans up a picture nobody takes", async () => {
    const { store, advance, timers } = setup();
    await store.put(png());
    expect(timers).toHaveLength(1);
    advance(HANDOFF_TTL_MS - 1);
    expect(store.size()).toBe(1);
    advance(1);
    expect(store.size()).toBe(0);
    expect(store.take(TOKEN, "halftone")).toBeNull();
  });

  it("refuses an expired picture even before its timer ran", async () => {
    let time = 0;
    const store = createHandoffStore({
      now: () => time,
      randomToken: () => TOKEN,
      setTimeout: () => null,
      clearTimeout: () => undefined,
    });
    await store.put(png());
    time = HANDOFF_TTL_MS;
    expect(store.take(TOKEN, "halftone")).toBeNull();
  });

  it("refuses pictures over the upload limit and anything but PNG, JPEG or WebP", async () => {
    const { store } = setup();
    const big = new Uint8Array(IMAGE_INPUT_MAX_BYTES + 1);
    big.set(PNG_HEAD);
    expect(await store.put(entry([big]))).toEqual({ ok: false, error: "too-large" });
    expect(await store.put(entry(["<svg xmlns='http://www.w3.org/2000/svg'/>"]))).toEqual({
      ok: false,
      error: "unsupported-type",
    });
    expect(await store.put(entry(["GIF89a......"]))).toEqual({
      ok: false,
      error: "unsupported-type",
    });
    expect(await store.put(entry(["not an image"]))).toEqual({
      ok: false,
      error: "unsupported-type",
    });
    expect(store.size()).toBe(0);
  });

  it("uses a fresh random 128-bit token by default", async () => {
    const store = createHandoffStore();
    const a = await store.put(png());
    const b = await store.put(png());
    if (!a.ok || !b.ok) throw new Error("put failed");
    expect(a.token).toMatch(/^[0-9a-f]{32}$/);
    expect(b.token).not.toBe(a.token);
    store.clear();
  });
});

describe("hand-over hash", () => {
  it("writes and reads the token", () => {
    expect(handoffHash(TOKEN)).toBe(`#handoff=${TOKEN}`);
    expect(handoffTokenFromHash(`#handoff=${TOKEN}`)).toBe(TOKEN);
    expect(handoffTokenFromHash(`#d=abc&handoff=${TOKEN}`)).toBe(TOKEN);
    expect(handoffTokenFromHash("#handoff=XYZ")).toBeNull();
    expect(handoffTokenFromHash("#design=abc")).toBeNull();
    expect(handoffTokenFromHash("")).toBeNull();
  });

  it("removes only the token from the hash", () => {
    expect(hashWithoutHandoff(`#handoff=${TOKEN}`)).toBe("");
    expect(hashWithoutHandoff(`#design=abc&handoff=${TOKEN}`)).toBe("#design=abc");
    expect(hashWithoutHandoff("")).toBe("");
  });
});

it("default timers do not keep anything after clear", async () => {
  vi.useFakeTimers();
  try {
    const store = createHandoffStore();
    await store.put(png());
    store.clear();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
