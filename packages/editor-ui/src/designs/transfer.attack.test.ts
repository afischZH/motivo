/**
 * Attack tests for the designs file import (M3-AP11 security review): hostile
 * files must neither break the app nor smuggle anything past validation, and
 * must stay cheap enough for the import worker.
 */
import { UPLOAD_RASTER_MAX_EDGE, registry, type AnyToolDefinition } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import {
  DESIGNS_FILE_FORMAT,
  DESIGNS_FILE_MAX_BYTES,
  buildDesignsFile,
  designsFileName,
  designsFileTexts,
  isSafeRasterHref,
  parseDesignsFile,
  rasterEdgeLimit,
  rasterEdgeLimits,
  type DesignsFileEntry,
} from "./transfer";

function tool(id: string): AnyToolDefinition {
  const found = registry.get(id);
  if (!found) throw new Error(`missing tool ${id}`);
  return found;
}

const blob = tool("blob");
const seamless = tool("seamless-patterns");

const entry = (over: Partial<DesignsFileEntry> = {}): DesignsFileEntry => ({
  id: "abc123",
  toolId: "blob",
  toolVersion: blob.version,
  name: "Blob",
  seed: 7,
  size: { width: 1080, height: 1080 },
  params: blob.defaults as Record<string, unknown>,
  createdAt: 1_000,
  updatedAt: 2_000,
  ...over,
});

const fileText = (designs: unknown[]) =>
  JSON.stringify({ format: DESIGNS_FILE_FORMAT, version: 1, exportedAt: 1, designs });

/** A 1x1 PNG. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const time = (fn: () => void) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

// Large inputs on purpose: generous timeouts for loaded CI machines.
describe("designs import under attack", { timeout: 60_000 }, () => {
  it("survives nesting deep enough to overflow a recursive walker", () => {
    const depth = 200_000;
    const text = `{"format":"${DESIGNS_FILE_FORMAT}","version":1,"designs":[{"params":{"x":${"[".repeat(depth)}${"]".repeat(depth)}}}]}`;
    expect(text.length).toBeLessThan(DESIGNS_FILE_MAX_BYTES);
    const result = parseDesignsFile(text, registry);
    // Either refused as malformed or the design skipped; never a throw.
    if (result.ok) expect(result.designs).toEqual([]);
    else expect(result.error).toBe("malformed");
  });

  it("keeps deep but parseable params out of the stored design", () => {
    let nested: unknown = 1;
    for (let i = 0; i < 2_000; i++) nested = { a: nested };
    const parsed = parseDesignsFile(
      fileText([entry({ params: { ...(blob.defaults as object), evil: nested } })]),
      registry,
    );
    expect(parsed.ok && parsed.designs[0]?.params).not.toHaveProperty("evil");
  });

  it("refuses prototype keys hidden in escapes and nested params", () => {
    for (const key of [
      "__proto__",
      "\\u005f\\u005fproto\\u005f\\u005f",
      "constructor",
      "prototype",
    ]) {
      const text = `{"format":"${DESIGNS_FILE_FORMAT}","version":1,"designs":[{"params":{"layers":[{"${key}":{"polluted":1}}]}}]}`;
      expect(parseDesignsFile(text, registry), key).toEqual({ ok: false, error: "forbidden-keys" });
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("does not resolve tools through the prototype chain", () => {
    for (const toolId of ["constructor", "tostring", "hasownproperty"]) {
      const parsed = parseDesignsFile(fileText([entry({ toolId })]), registry);
      expect(parsed.ok && parsed.skipped.map((s) => s.reason), toolId).toEqual(["unknown-tool"]);
    }
  });

  it("skips huge names, ids and sizes without echoing them", () => {
    const huge = "x".repeat(5_000_000);
    const parsed = parseDesignsFile(
      fileText([
        entry({ name: huge }),
        entry({ id: huge }),
        entry({ id: "../../etc" }),
        entry({ size: { width: 1e9, height: 16 } }),
        entry({ seed: -1 }),
        entry({ seed: 2 ** 32 }),
        entry({ createdAt: Number.MAX_SAFE_INTEGER }),
        entry({ toolVersion: 0 }),
      ]),
      registry,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.designs).toEqual([]);
    expect(parsed.skipped).toHaveLength(8);
    for (const s of parsed.skipped) expect((s.name ?? "").length).toBeLessThanOrEqual(120);
  });

  it("stays fast with the most designs a file may hold", () => {
    const designs = Array.from({ length: 2_000 }, (_, i) => entry({ id: `d${i}` }));
    const text = fileText(designs);
    let ok = false;
    const ms = time(() => {
      const parsed = parseDesignsFile(text, registry);
      ok = parsed.ok && parsed.designs.length === 2_000;
    });
    expect(ok).toBe(true);
    // Runs in the import worker; generous bound against accidental quadratic work.
    expect(ms).toBeLessThan(5_000);
  });

  it("refuses millions of tiny entries before validating them", () => {
    const text = fileText(new Array<number>(2_000_000).fill(0));
    expect(text.length).toBeLessThan(DESIGNS_FILE_MAX_BYTES);
    expect(parseDesignsFile(text, registry)).toEqual({ ok: false, error: "too-many" });
  });

  it("sanitises hostile SVG uploads to inert markup", () => {
    const hostile = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" onclick="alert(1)"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject><iframe src="javascript:alert(1)"/></foreignObject><rect width="1" height="1"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><image xlink:href="https://evil.example/x.png" width="1" height="1"/><rect width="1" height="1" style="fill:url(https://evil.example/a)"/></svg>',
    ];
    for (const svg of hostile) {
      const parsed = parseDesignsFile(
        fileText([
          entry({
            toolId: "seamless-patterns",
            toolVersion: seamless.version,
            params: {
              ...(seamless.defaults as Record<string, unknown>),
              upload: { kind: "svg", svg, width: 10, height: 10, name: "x.svg" },
            },
          }),
        ]),
        registry,
      );
      if (!parsed.ok) throw new Error(parsed.error);
      const stored = parsed.designs[0]?.params.upload as { svg: string } | undefined;
      if (!stored) continue; // skipped as unsafe: fine too
      expect(stored.svg).not.toMatch(
        /script|onclick|foreignObject|iframe|javascript:|evil\.example/i,
      );
    }
  });

  it("refuses raster data URIs that would not decode in full", () => {
    // Valid PNG header, then a length `atob` rejects (4n + 1 characters).
    const withLength = (target: number) => {
      const base = PNG_1X1.replace(/=+$/, "");
      return base + "A".repeat(target - base.length);
    };
    const short = withLength(4 * 30 + 1);
    expect(() => atob(short)).toThrow();
    expect(isSafeRasterHref(`data:image/png;base64,${short}`)).toBe(false);
    // Same beyond the part read for the header.
    const long = withLength(4 * 20_000 + 1);
    expect(isSafeRasterHref(`data:image/png;base64,${long}`)).toBe(false);
    // Unpadded base64 is not what our encoders write either.
    expect(isSafeRasterHref(`data:image/png;base64,${withLength(4 * 30 + 2)}`)).toBe(false);
    expect(isSafeRasterHref(`data:image/png;base64,${PNG_1X1}`)).toBe(true);
  });

  it("exports large collections in files that each import again", async () => {
    // Uploads make designs large: one file would exceed the import limit.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0${" L1 1".repeat(160_000)}"/></svg>`;
    const designs = Array.from({ length: 45 }, (_, i) =>
      entry({
        id: `u${i}`,
        toolId: "seamless-patterns",
        toolVersion: seamless.version,
        params: {
          ...(seamless.defaults as Record<string, unknown>),
          upload: { kind: "svg", svg, width: 10, height: 10, name: "big.svg" },
        },
      }),
    );
    expect(JSON.stringify(buildDesignsFile(designs, 1)).length).toBeGreaterThan(
      DESIGNS_FILE_MAX_BYTES,
    );
    const texts = await designsFileTexts(designs, 1);
    expect(texts.length).toBeGreaterThan(1);
    const ids: string[] = [];
    for (const text of texts) {
      const parsed = parseDesignsFile(text, registry);
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.skipped).toEqual([]);
      ids.push(...parsed.designs.map((d) => d.id));
    }
    expect(ids).toEqual(designs.map((d) => d.id));
    expect(designsFileName(new Date(2026, 9, 28), 1, texts.length)).toBe(
      "musterli-designs-v1-2026-10-28-2.json",
    );
    // Small exports stay one file, identical to the single-file format.
    expect(await designsFileTexts([entry()], 1)).toEqual([
      JSON.stringify(buildDesignsFile([entry()], 1)),
    ]);
  });

  it("refuses raster data URIs with parameters, whitespace or other types", () => {
    for (const href of [
      `data:image/png;charset=utf-8;base64,${PNG_1X1}`,
      `data:image/png;base64, ${PNG_1X1}`,
      `data:image/svg+xml;base64,${PNG_1X1}`,
      `DATA:image/png;base64,${PNG_1X1}`,
      `data:image/png;base64,${PNG_1X1}\n`,
      `https://evil.example/x.png`,
    ]) {
      expect(isSafeRasterHref(href), href).toBe(false);
    }
  });
});

/** A PNG data URI whose header claims `width` × `height` (the pixels are the 1x1 image's). */
function pngClaiming(width: number, height: number): string {
  const bytes = Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0));
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

const raster = (width: number, height: number, header = { width, height }) => ({
  kind: "raster",
  href: pngClaiming(header.width, header.height),
  width,
  height,
  name: "x.png",
});

/** Imports one design of `toolId` with `params` over its defaults; the skip reason or "ok". */
function importOne(toolId: string, params: Record<string, unknown>): string {
  const t = tool(toolId);
  const parsed = parseDesignsFile(
    fileText([
      entry({
        toolId,
        toolVersion: t.version,
        params: { ...(t.defaults as Record<string, unknown>), ...params },
      }),
    ]),
    registry,
  );
  if (!parsed.ok) return parsed.error;
  return parsed.skipped[0]?.reason ?? (parsed.designs.length === 1 ? "ok" : "none");
}

describe("pixel limits per image param", () => {
  it("reads each param's limit from the tool's own schema", () => {
    expect(Object.fromEntries(rasterEdgeLimits(tool("screenshot-beautifier")))).toMatchObject({
      screenshot: 3840,
      screenshotTablet: 3840,
      screenshotPhone: 3840,
    });
    for (const id of ["duotone", "halftone", "cmyk-halftone", "dither"]) {
      expect(rasterEdgeLimits(tool(id)).get("photo"), id).toBe(4096);
    }
    expect(rasterEdgeLimits(tool("ascii-art")).get("photo")).toBe(1024);
    expect(rasterEdgeLimits(tool("glass-effects")).get("backgroundImage")).toBe(2048);
    expect(rasterEdgeLimits(tool("bento-grid")).get("backgroundImage")).toBe(2048);
    // Nested in a record of tiles: the per-tile uploads (1024 px).
    expect(rasterEdgeLimits(tool("bento-grid")).get("tileImages")).toBe(1024);
    expect(rasterEdgeLimits(tool("seamless-patterns")).get("upload")).toBe(1024);
    // Every image param of every tool has a limit, at most the largest upload.
    for (const t of registry.list()) {
      for (const [key, limit] of rasterEdgeLimits(t)) {
        expect(limit, `${t.id}.${key}`).toBeGreaterThan(0);
        expect(limit, `${t.id}.${key}`).toBeLessThanOrEqual(UPLOAD_RASTER_MAX_EDGE);
      }
    }
    expect(rasterEdgeLimit(z.string())).toBeNull();
  });

  it("accepts pictures up to the limit of their param", () => {
    expect(importOne("screenshot-beautifier", { screenshot: raster(3840, 2160) })).toBe("ok");
    expect(importOne("duotone", { photo: raster(4096, 3072) })).toBe("ok");
    expect(importOne("halftone", { photo: raster(3072, 4096) })).toBe("ok");
    expect(importOne("glass-effects", { backgroundImage: raster(2048, 1365) })).toBe("ok");
  });

  it("refuses a picture whose header is larger than its param allows", () => {
    // Declared within the limit, the picture itself larger: 4096 px is fine
    // for a photo effect, but not for a screenshot.
    expect(
      importOne("screenshot-beautifier", {
        screenshot: raster(3840, 2160, { width: 4096, height: 2160 }),
      }),
    ).toBe("unsafe-upload");
    expect(
      importOne("screenshot-beautifier", {
        screenshotPhone: raster(1170, 2532, { width: 1170, height: 3841 }),
      }),
    ).toBe("unsafe-upload");
    expect(importOne("duotone", { photo: raster(4096, 3072, { width: 4097, height: 3072 }) })).toBe(
      "unsafe-upload",
    );
    expect(
      importOne("ascii-art", { photo: raster(1024, 768, { width: 2048, height: 1536 }) }),
    ).toBe("unsafe-upload");
    expect(
      importOne("glass-effects", {
        backgroundImage: raster(2048, 1024, { width: 3840, height: 1024 }),
      }),
    ).toBe("unsafe-upload");
    expect(
      importOne("bento-grid", {
        tileImages: {
          t1: { graphic: raster(512, 512, { width: 2048, height: 512 }), background: null },
        },
      }),
    ).toBe("unsafe-upload");
  });

  it("refuses a picture declared larger than its param allows", () => {
    expect(importOne("screenshot-beautifier", { screenshot: raster(4096, 2160) })).toBe(
      "invalid-params",
    );
    expect(importOne("duotone", { photo: raster(4097, 100) })).toBe("invalid-params");
    expect(importOne("ascii-art", { photo: raster(1025, 100) })).toBe("invalid-params");
  });

  it("refuses a picture larger than declared, even within the param's limit", () => {
    expect(importOne("duotone", { photo: raster(800, 600, { width: 4000, height: 3000 }) })).toBe(
      "unsafe-upload",
    );
  });
});
