import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LARGE_DATA_URL,
  largeDataUrls,
  liveObjectUrlCount,
  loadObjectUrl,
  objectUrlOf,
  retainObjectUrl,
  withObjectUrls,
} from "./large-data-urls";
import { parseCssDeclarations } from "./render";

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A base64 PNG data URI of about `length` characters (the bytes need not be a valid PNG here). */
function bigDataUrl(length: number, fill = "A"): string {
  return `data:image/png;base64,iVBORw0KGgo${fill.repeat(length - (length % 4))}`;
}

describe("large data URIs in CSS previews", () => {
  const big = bigDataUrl(LARGE_DATA_URL + 400);
  const css = `background-image: url("${big}");\nbackground-size: 10px 10px;\nborder-radius: 4px;`;

  it("finds large base64 data URIs and ignores small ones", () => {
    expect(largeDataUrls(parseCssDeclarations(css))).toEqual([big]);
    const small = `background-image: url("${bigDataUrl(400)}");`;
    expect(largeDataUrls(parseCssDeclarations(small))).toEqual([]);
    const svg = `background-image: url("data:image/svg+xml;charset=utf-8,${"%20".repeat(LARGE_DATA_URL)}");`;
    expect(largeDataUrls(parseCssDeclarations(svg))).toEqual([]);
  });

  it("never turns a non-raster data URI into a same-origin blob URL", () => {
    const body = "A".repeat(LARGE_DATA_URL);
    for (const type of ["text/html", "image/svg+xml", "application/javascript"]) {
      const value = `background-image: url("data:${type};base64,${body}");`;
      expect(largeDataUrls(parseCssDeclarations(value)), type).toEqual([]);
    }
  });

  it("leaves the picture out until it is decoded, then shows it through a blob URL", async () => {
    const decls = parseCssDeclarations(css);
    const before = withObjectUrls(decls, [big]);
    expect(before.map(([p]) => p)).toEqual(["background-size", "border-radius"]);

    const release = retainObjectUrl(big);
    const url = await loadObjectUrl(big);
    expect(url).toMatch(/^blob:/);
    expect(objectUrlOf(big)).toBe(url);
    expect(await loadObjectUrl(big)).toBe(url);
    const after = withObjectUrls(decls, [big]);
    expect(after[0]).toEqual(["background-image", [`url("${url}")`]]);
    expect(after.slice(1)).toEqual(decls.slice(1));
    release();
    await nextTask();
    expect(objectUrlOf(big)).toBeUndefined();
  });

  it("decodes the base64 bytes exactly", async () => {
    const bytes = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 7) & 255);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const dataUrl = `data:image/png;base64,${btoa(binary)}`;
    const release = retainObjectUrl(dataUrl);
    const url = await loadObjectUrl(dataUrl);
    expect(url).toBeDefined();
    const blob = await (await fetch(url ?? "")).blob();
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    release();
    await nextTask();
  });

  describe("revoking", () => {
    const revoked: string[] = [];
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      revoked.length = 0;
      const original = URL.revokeObjectURL.bind(URL);
      spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
        revoked.push(url);
        original(url);
      });
    });
    afterEach(() => spy.mockRestore());

    it("revokes an object URL as soon as its last holder lets go", async () => {
      const dataUrl = bigDataUrl(LARGE_DATA_URL + 40, "B");
      const first = retainObjectUrl(dataUrl);
      const second = retainObjectUrl(dataUrl);
      const url = await loadObjectUrl(dataUrl);
      first();
      first(); // twice is once
      await nextTask();
      expect(objectUrlOf(dataUrl)).toBe(url);
      expect(revoked).toEqual([]);
      second();
      await nextTask();
      expect(objectUrlOf(dataUrl)).toBeUndefined();
      expect(revoked).toEqual([url]);
      await expect(fetch(url ?? "")).rejects.toThrow();
    });

    it("keeps the URL when a re-render lets go and holds it again in one task", async () => {
      const dataUrl = bigDataUrl(LARGE_DATA_URL + 80, "C");
      const before = retainObjectUrl(dataUrl);
      const url = await loadObjectUrl(dataUrl);
      before();
      const after = retainObjectUrl(dataUrl);
      await nextTask();
      expect(objectUrlOf(dataUrl)).toBe(url);
      expect(revoked).toEqual([]);
      after();
      await nextTask();
      expect(revoked).toEqual([url]);
    });

    it("revokes a picture that finished decoding after everyone let go", async () => {
      const dataUrl = bigDataUrl(LARGE_DATA_URL + 120, "D");
      const release = retainObjectUrl(dataUrl);
      const job = loadObjectUrl(dataUrl);
      release();
      const url = await job;
      await nextTask();
      expect(objectUrlOf(dataUrl)).toBeUndefined();
      expect(revoked).toEqual([url]);
    });

    it("holds no object URLs once no picture is shown", async () => {
      const urls = [1, 2, 3].map((n) => bigDataUrl(LARGE_DATA_URL + n * 4, "E"));
      const releases = urls.map(retainObjectUrl);
      await Promise.all(urls.map(loadObjectUrl));
      const live = liveObjectUrlCount();
      expect(live).toBeGreaterThanOrEqual(3);
      for (const release of releases) release();
      await nextTask();
      expect(liveObjectUrlCount()).toBe(live - 3);
    });
  });

  it("keeps the declarations untouched without large data URIs", () => {
    const decls = parseCssDeclarations("background: red;");
    expect(withObjectUrls(decls, [])).toBe(decls);
  });
});
