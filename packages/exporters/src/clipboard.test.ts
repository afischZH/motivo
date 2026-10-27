import { afterEach, describe, expect, it, vi } from "vitest";
import { canCopyImage, canCopyText, copyPng, copyText } from "./clipboard";

class FakeClipboardItem {
  static supports: ((type: string) => boolean) | undefined;
  constructor(readonly items: Record<string, Blob | Promise<Blob>>) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeClipboardItem.supports = undefined;
});

function stubClipboard(clipboard: object | undefined, item: unknown = FakeClipboardItem): void {
  // `null` stands for "no ClipboardItem" (undefined would select the default).
  item = item === null ? undefined : item;
  vi.stubGlobal("navigator", clipboard === undefined ? {} : { clipboard });
  vi.stubGlobal("ClipboardItem", item);
}

describe("feature detection", () => {
  it("reports missing APIs", () => {
    stubClipboard(undefined, null);
    expect(canCopyText()).toBe(false);
    expect(canCopyImage()).toBe(false);
  });

  it("detects text and image support", () => {
    stubClipboard({ writeText: vi.fn(), write: vi.fn() });
    expect(canCopyText()).toBe(true);
    expect(canCopyImage()).toBe(true);
  });

  it("honours ClipboardItem.supports", () => {
    FakeClipboardItem.supports = (t) => t === "text/plain";
    stubClipboard({ write: vi.fn() });
    expect(canCopyImage()).toBe(false);
  });
});

describe("copyText", () => {
  it("writes text", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard({ writeText });
    await expect(copyText("hi")).resolves.toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith("hi");
  });

  it("maps errors", async () => {
    stubClipboard({ writeText: () => Promise.reject(new DOMException("no", "NotAllowedError")) });
    await expect(copyText("x")).resolves.toMatchObject({ ok: false, reason: "denied" });
    stubClipboard({ writeText: () => Promise.reject(new Error("x")) });
    await expect(copyText("x")).resolves.toMatchObject({ ok: false, reason: "failed" });
    stubClipboard(undefined);
    await expect(copyText("x")).resolves.toEqual({ ok: false, reason: "unsupported" });
  });
});

describe("copyPng", () => {
  it("creates the ClipboardItem synchronously with a pending blob", async () => {
    let item: FakeClipboardItem | undefined;
    const write = vi.fn((items: FakeClipboardItem[]) => {
      item = items[0];
      return Promise.resolve();
    });
    stubClipboard({ write });
    let resolveBlob: (b: Blob) => void = () => undefined;
    const pending = new Promise<Blob>((r) => (resolveBlob = r));
    const result = copyPng(pending);
    // Called before the blob exists: required by Safari's user-gesture rule.
    expect(write).toHaveBeenCalledTimes(1);
    const png = new Blob(["x"], { type: "image/png" });
    resolveBlob(png);
    await expect(result).resolves.toEqual({ ok: true });
    await expect(item?.items["image/png"]).resolves.toBe(png);
  });

  it("rejects non-PNG blobs and unsupported browsers", async () => {
    stubClipboard({
      write: async (items: FakeClipboardItem[]) => {
        await items[0]?.items["image/png"];
      },
    });
    await expect(copyPng(new Blob(["x"], { type: "image/jpeg" }))).resolves.toMatchObject({
      ok: false,
      reason: "failed",
    });
    stubClipboard({ write: vi.fn() }, null);
    await expect(copyPng(new Blob([]))).resolves.toEqual({ ok: false, reason: "unsupported" });
  });
});
