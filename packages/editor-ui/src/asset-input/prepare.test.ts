import { describe, expect, it, vi } from "vitest";
import type { ImageInputServices } from "../image-input/services";
import { finishAsset, readAsset, sourceSize, type AssetSource } from "./prepare";

const u32be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const png = (w: number, h: number) =>
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

const file = (parts: BlobPart[], name: string, type = "") => new File(parts, name, { type });

const HOSTILE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" onload="alert(1)">' +
  '<script>alert(1)</script><rect width="20" height="10" fill="red"/>' +
  '<image href="https://example.com/x.png"/></svg>';

const services = (crop: ImageInputServices["crop"]) => ({ crop: vi.fn(crop) });

describe("readAsset", () => {
  it("sanitises SVG right away and reports what was removed", async () => {
    const result = await readAsset(file([HOSTILE_SVG], "logo.svg"));
    expect(result.ok).toBe(true);
    if (!result.ok || result.source.kind !== "svg") throw new Error("expected svg");
    expect(result.source.name).toBe("logo.svg");
    expect(result.source.svg).not.toMatch(/script|onload|example\.com/i);
    expect(result.source.svg).toContain("<rect");
    expect(result.source.removed).toBeGreaterThanOrEqual(3);
    expect(sourceSize(result.source)).toEqual({ width: 20, height: 10 });
  });

  it("refuses SVG in photo fields (rasterOnly), by bytes, before sanitising", async () => {
    const svg = await readAsset(file([HOSTILE_SVG], "photo.jpg", "image/jpeg"), {
      rasterOnly: true,
    });
    expect(svg).toEqual({ ok: false, error: "raster-only" });
    const raster = await readAsset(file([png(30, 20)], "photo.png"), { rasterOnly: true });
    expect(raster).toMatchObject({ ok: true, source: { kind: "raster" } });
  });

  it("decides by bytes, not by name or declared type", async () => {
    const fakePng = await readAsset(file(["not an image"], "x.png", "image/png"));
    expect(fakePng).toEqual({ ok: false, error: "unsupported-type" });
    const realPng = await readAsset(file([png(30, 20)], "photo.txt", "text/plain"));
    expect(realPng).toMatchObject({
      ok: true,
      source: { kind: "raster", mime: "image/png", width: 30, height: 20 },
    });
  });

  it("rejects GIF, oversize files and unsafe SVG", async () => {
    const gif = new Uint8Array([..."GIF89a"].map((c) => c.charCodeAt(0)).concat([1, 0, 1, 0, 0]));
    expect(await readAsset(file([gif], "a.gif"))).toEqual({ ok: false, error: "unsupported-type" });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    expect(await readAsset(file([big], "big.png"))).toEqual({ ok: false, error: "too-large" });
    const xxe =
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">&x;</svg>';
    expect(await readAsset(file([xxe], "x.svg"))).toEqual({ ok: false, error: "svg-invalid" });
    const huge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><desc>${"a".repeat(1_100_000)}</desc></svg>`;
    expect(await readAsset(file([huge], "h.svg"))).toEqual({ ok: false, error: "svg-too-large" });
  });
});

describe("finishAsset", () => {
  it("crops SVG through the sanitizer (new viewBox)", async () => {
    const read = await readAsset(file([HOSTILE_SVG], "logo.svg"));
    if (!read.ok) throw new Error("read failed");
    const svc = services(async () => ({ ok: false, error: "decode-failed" }));
    const result = await finishAsset(read.source, { x: 0.5, y: 0, w: 0.5, h: 1 }, svc);
    expect(svc.crop).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, asset: { kind: "svg", width: 10, height: 10 } });
    if (!result.ok || result.asset.kind !== "svg") throw new Error("expected svg");
    expect(result.asset.svg).toContain('viewBox="10 0 10 10"');
  });

  it("crops raster pictures in the image worker, capped at 1024 px", async () => {
    const source: AssetSource = {
      kind: "raster",
      name: "p.png",
      bytes: png(2000, 1000),
      mime: "image/png",
      width: 2000,
      height: 1000,
    };
    const svc = services(async () => ({
      ok: true,
      href: "data:image/png;base64,iVBORw0KGgo=",
      width: 512,
      height: 512,
    }));
    const result = await finishAsset(source, { x: 0.25, y: 0, w: 0.5, h: 1 }, svc);
    expect(svc.crop).toHaveBeenCalledWith(
      source.bytes,
      "image/png",
      { x: 500, y: 0, width: 1000, height: 1000 },
      1024,
    );
    expect(result).toEqual({
      ok: true,
      asset: {
        kind: "raster",
        href: "data:image/png;base64,iVBORw0KGgo=",
        width: 512,
        height: 512,
        name: "p.png",
      },
    });
  });

  it("refuses worker output that is not a PNG or JPEG data URI", async () => {
    const source: AssetSource = {
      kind: "raster",
      name: "p.png",
      bytes: png(10, 10),
      mime: "image/png",
      width: 10,
      height: 10,
    };
    const svc = services(async () => ({
      ok: true,
      href: "data:image/svg+xml;base64,PHN2Zz4=",
      width: 10,
      height: 10,
    }));
    expect((await finishAsset(source, { x: 0, y: 0, w: 1, h: 1 }, svc)).ok).toBe(false);
    const failing = services(async () => {
      throw new Error("boom");
    });
    expect(await finishAsset(source, { x: 0, y: 0, w: 1, h: 1 }, failing)).toEqual({
      ok: false,
      error: "decode-failed",
    });
  });
});
