import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ImageInputServices } from "../image-input/services";
import { selectCanUndo, createEditorStore } from "../store/editor-store";
import { createHandoffStore, handoffHash, type HandoffEntry, type HandoffStore } from "./store";
import {
  useHandoffReceiver,
  type HandoffOutcome,
  type HandoffReceiverOptions,
} from "./use-handoff-receiver";

const u32be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const pngHeader = (w: number, h: number) =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32be(13),
    ...[..."IHDR"].map((c) => c.charCodeAt(0)),
    ...u32be(w),
    ...u32be(h),
    8,
    6,
    0,
    0,
    0,
  ]);
const JPEG_URI = "data:image/jpeg;base64,/9j/4AAQ";

function fakeImageServices(): ImageInputServices {
  return {
    decode: vi.fn(),
    derive: vi.fn(),
    crop: vi.fn<ImageInputServices["crop"]>(async (_bytes, _mime, rect) => ({
      ok: true,
      href: JPEG_URI,
      width: rect.width,
      height: rect.height,
    })),
    dispose: vi.fn(),
  } as unknown as ImageInputServices;
}

function location(hash: string) {
  const loc = {
    hash,
    getHash: () => loc.hash,
    replaceHash: vi.fn((next: string) => {
      loc.hash = next;
    }),
  };
  return loc;
}

async function prepared(entry: Partial<HandoffEntry> = {}) {
  const handoffs = createHandoffStore();
  const put = await handoffs.put({
    sourceToolId: "polka-dots",
    toolId: "halftone",
    param: "photo",
    blob: new Blob([pngHeader(640, 480)], { type: "image/png" }),
    name: "musterli-polka-dots-1.png",
    ...entry,
  });
  if (!put.ok) throw new Error("put failed");
  return { handoffs, hash: handoffHash(put.token) };
}

function receive(
  toolId: string,
  options: Partial<HandoffReceiverOptions> & { handoffs: HandoffStore; hash: string },
  wrapper?: (props: { children: ReactNode }) => ReactNode,
) {
  const store = createEditorStore({ toolId });
  const loc = location(options.hash);
  const outcomes: HandoffOutcome[] = [];
  const services = fakeImageServices();
  const hook = renderHook(
    ({ ready }: { ready: boolean }) =>
      useHandoffReceiver({
        store,
        ready,
        onOutcome: (o) => outcomes.push(o),
        handoffs: options.handoffs,
        location: loc,
        services,
      }),
    { initialProps: { ready: options.ready ?? true }, ...(wrapper ? { wrapper } : {}) },
  );
  return { store, loc, outcomes, services, hook };
}

describe("useHandoffReceiver", () => {
  it("puts the picture into the photo param as one undo step and clears the hash", async () => {
    const { handoffs, hash } = await prepared();
    const { store, loc, outcomes } = receive("halftone", { handoffs, hash });
    expect(loc.replaceHash).toHaveBeenCalledWith("");
    const before = store.getState().size;
    await waitFor(() =>
      expect(outcomes).toEqual([{ kind: "applied", sourceToolId: "polka-dots" }]),
    );
    const s = store.getState();
    expect(s.params.photo).toEqual({
      kind: "raster",
      href: JPEG_URI,
      width: 640,
      height: 480,
      name: "musterli-polka-dots-1.png",
    });
    // A photo sets the design size (same step, as with an upload).
    expect(s.size).toEqual({ width: 640, height: 480 });
    expect(selectCanUndo(s)).toBe(true);
    s.undo();
    expect(store.getState().params.photo).toBeNull();
    expect(store.getState().size).toEqual(before);
    // Taken once: nothing is left behind.
    expect(handoffs.size()).toBe(0);
  });

  it("waits until the editor is ready (draft or saved design loaded)", async () => {
    const { handoffs, hash } = await prepared();
    const { store, outcomes, hook } = receive("halftone", { handoffs, hash, ready: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(outcomes).toEqual([]);
    expect(store.getState().params.photo).toBeNull();
    hook.rerender({ ready: true });
    await waitFor(() => expect(outcomes).toHaveLength(1));
    expect(store.getState().params.photo).not.toBeNull();
  });

  it("takes the token once under StrictMode", async () => {
    const { handoffs, hash } = await prepared();
    const { outcomes } = receive("halftone", { handoffs, hash }, StrictMode);
    await waitFor(() => expect(outcomes).toHaveLength(1));
    expect(outcomes[0]?.kind).toBe("applied");
  });

  it("says so when the picture is gone (reload, expired, other tool)", async () => {
    const { handoffs, hash } = await prepared();
    const { outcomes, store } = receive("duotone", { handoffs, hash });
    await waitFor(() => expect(outcomes).toEqual([{ kind: "expired" }]));
    expect(store.getState().params.photo).toBeNull();
  });

  it("does nothing without a token", async () => {
    const handoffs = createHandoffStore();
    const { outcomes, loc } = receive("halftone", { handoffs, hash: "#d=abc" });
    await new Promise((r) => setTimeout(r, 10));
    expect(outcomes).toEqual([]);
    expect(loc.replaceHash).not.toHaveBeenCalled();
  });

  it("rejects broken data with the upload's error, leaving the design as it was", async () => {
    const entry: HandoffEntry = {
      sourceToolId: "polka-dots",
      toolId: "halftone",
      param: "photo",
      blob: new Blob(["definitely not a png"]),
      name: "x.png",
    };
    const handoffs: HandoffStore = {
      put: vi.fn(),
      take: vi.fn(() => entry),
      clear: vi.fn(),
      size: () => 0,
    };
    const { outcomes, store, services } = receive("halftone", {
      handoffs,
      hash: "#handoff=0123456789abcdef0123456789abcdef",
    });
    await waitFor(() =>
      expect(outcomes).toEqual([{ kind: "rejected", error: "unsupported-type" }]),
    );
    expect(services.crop).not.toHaveBeenCalled();
    expect(store.getState().params.photo).toBeNull();
    expect(selectCanUndo(store.getState())).toBe(false);
  });

  it("refuses a param that is no picture slot of the target", async () => {
    const { handoffs, hash } = await prepared({ toolId: "screenshot-beautifier", param: "url" });
    const { outcomes, store } = receive("screenshot-beautifier", { handoffs, hash });
    await waitFor(() =>
      expect(outcomes).toEqual([{ kind: "rejected", error: "unsupported-type" }]),
    );
    expect(store.getState().params.url).toBe("musterli.app");
  });

  it("hands the picture to the image picker of an imageInput tool", async () => {
    const { handoffs, hash } = await prepared({ toolId: "palette-from-image", param: null });
    const { outcomes, hook } = receive("palette-from-image", { handoffs, hash });
    await waitFor(() =>
      expect(outcomes).toEqual([{ kind: "analysing", sourceToolId: "polka-dots" }]),
    );
    expect(hook.result.current?.file.name).toBe("musterli-polka-dots-1.png");
    expect(hook.result.current?.file.size).toBeGreaterThan(0);
  });
});
