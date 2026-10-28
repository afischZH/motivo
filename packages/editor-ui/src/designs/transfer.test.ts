import { registry, type AnyToolDefinition } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { readDesignsFile } from "./import-client";
import {
  DESIGNS_FILE_FORMAT,
  DESIGNS_FILE_MAX_BYTES,
  DESIGNS_FILE_MAX_DESIGNS,
  buildDesignsFile,
  designsFileName,
  isSafeRasterHref,
  parseDesignsFile,
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

const fileText = (designs: unknown[], over: Record<string, unknown> = {}) =>
  JSON.stringify({ format: DESIGNS_FILE_FORMAT, version: 1, exportedAt: 1, designs, ...over });

const svgUpload = (svg: string) => ({
  ...(seamless.defaults as Record<string, unknown>),
  upload: { kind: "svg", svg, width: 10, height: 10, name: "logo.svg" },
});

/** A 1x1 PNG. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("designs file", () => {
  it("round-trips designs", () => {
    const file = buildDesignsFile(
      [
        entry(),
        entry({
          id: "b",
          toolId: "svg-waves",
          params: tool("svg-waves").defaults as Record<string, unknown>,
        }),
      ],
      5,
    );
    const parsed = parseDesignsFile(JSON.stringify(file), registry);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toEqual([]);
    expect(parsed.designs.map((d) => d.id)).toEqual(["abc123", "b"]);
    expect(parsed.designs[0]).toMatchObject({
      name: "Blob",
      seed: 7,
      createdAt: 1_000,
      updatedAt: 2_000,
    });
  });

  it("names files with format, version and date", () => {
    expect(designsFileName(new Date(2026, 9, 28))).toBe("musterli-designs-v1-2026-10-28.json");
  });

  it("refuses files that are not ours", () => {
    expect(parseDesignsFile("", registry)).toEqual({ ok: false, error: "empty" });
    expect(parseDesignsFile("{not json", registry)).toEqual({ ok: false, error: "malformed" });
    expect(parseDesignsFile("[]", registry)).toEqual({ ok: false, error: "wrong-format" });
    expect(parseDesignsFile('"x"', registry)).toEqual({ ok: false, error: "wrong-format" });
    expect(parseDesignsFile(fileText([], { format: "other" }), registry)).toEqual({
      ok: false,
      error: "wrong-format",
    });
    expect(parseDesignsFile(fileText([], { version: 2 }), registry)).toEqual({
      ok: false,
      error: "unsupported-version",
    });
    expect(parseDesignsFile(fileText([], { designs: {} }), registry)).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });

  it("refuses oversized files and too many designs", () => {
    const huge = fileText([], { padding: "x".repeat(DESIGNS_FILE_MAX_BYTES) });
    expect(parseDesignsFile(huge, registry)).toEqual({ ok: false, error: "too-large" });
    // Multi-byte characters count as bytes, not as string length.
    const wide = fileText([], { padding: "ä".repeat(DESIGNS_FILE_MAX_BYTES / 2 + 10) });
    expect(parseDesignsFile(wide, registry)).toEqual({ ok: false, error: "too-large" });
    const many = fileText(Array.from({ length: DESIGNS_FILE_MAX_DESIGNS + 1 }, () => ({})));
    expect(parseDesignsFile(many, registry)).toEqual({ ok: false, error: "too-many" });
  });

  it("rejects prototype pollution keys anywhere", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const text = `{"format":"motivo-designs","version":1,"designs":[{"params":{"${key}":{"polluted":true}}}]}`;
      expect(parseDesignsFile(text, registry), key).toEqual({ ok: false, error: "forbidden-keys" });
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("skips invalid designs with a reason and keeps the rest", () => {
    const text = fileText([
      entry(),
      entry({ id: "bad id with spaces" }),
      entry({ toolId: "no-such-tool", name: "Weg" }),
      entry({ params: { ...(blob.defaults as Record<string, unknown>), palette: "red" } }),
      entry({ seed: -5 }),
      entry({ size: { width: 99_999, height: 10 } }),
      null,
      "string",
    ]);
    const parsed = parseDesignsFile(text, registry);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.designs).toHaveLength(1);
    expect(parsed.skipped.map((s) => [s.index, s.reason])).toEqual([
      [1, "invalid"],
      [2, "unknown-tool"],
      [3, "invalid-params"],
      [4, "invalid"],
      [5, "invalid"],
      [6, "invalid"],
      [7, "invalid"],
    ]);
    expect(parsed.skipped[1]?.name).toBe("Weg");
  });

  it("drops unknown param keys through the tool schema", () => {
    const params = { ...(blob.defaults as Record<string, unknown>), onload: "alert(1)" };
    const parsed = parseDesignsFile(fileText([entry({ params })]), registry);
    expect(parsed.ok && parsed.designs[0]?.params).not.toHaveProperty("onload");
  });

  it("sanitises uploaded SVGs again", () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><foreignObject><div/></foreignObject><image href="https://evil.example/x.png"/><rect width="10" height="10" fill="red"/></svg>';
    const parsed = parseDesignsFile(
      fileText([
        entry({
          toolId: "seamless-patterns",
          toolVersion: seamless.version,
          params: svgUpload(hostile),
        }),
      ]),
      registry,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toEqual([]);
    const upload = parsed.designs[0]?.params.upload as { svg: string };
    expect(upload.svg).toContain("<rect");
    expect(upload.svg).not.toMatch(/script|onload|foreignObject|evil\.example/i);
  });

  it("skips designs whose SVG upload is not an SVG", () => {
    const parsed = parseDesignsFile(
      fileText([
        entry({
          toolId: "seamless-patterns",
          toolVersion: seamless.version,
          params: svgUpload("<html><body>hi</body></html>"),
        }),
      ]),
      registry,
    );
    expect(parsed.ok && parsed.skipped.map((s) => s.reason)).toEqual(["unsafe-upload"]);
  });

  it("checks raster uploads by their magic bytes", () => {
    expect(isSafeRasterHref(`data:image/png;base64,${PNG_1X1}`)).toBe(true);
    // Declared JPEG, actually PNG.
    expect(isSafeRasterHref(`data:image/jpeg;base64,${PNG_1X1}`)).toBe(false);
    // Text dressed up as PNG.
    expect(isSafeRasterHref(`data:image/png;base64,${btoa("<svg onload=alert(1)>")}`)).toBe(false);
    expect(isSafeRasterHref("data:image/gif;base64,R0lGODlhAQABAAAAACw=")).toBe(false);
    // A PNG header claiming 5000 px: over the raster limit.
    const big = Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0));
    big.set([0, 0, 0x13, 0x88], 16);
    const bigHref = `data:image/png;base64,${btoa(String.fromCharCode(...big))}`;
    expect(isSafeRasterHref(bigHref)).toBe(false);

    const raster = (href: string) => ({
      ...(seamless.defaults as Record<string, unknown>),
      upload: { kind: "raster", href, width: 1, height: 1, name: "x.png" },
    });
    const parsed = parseDesignsFile(
      fileText([
        entry({
          toolId: "seamless-patterns",
          toolVersion: seamless.version,
          params: raster(`data:image/png;base64,${PNG_1X1}`),
        }),
        entry({
          toolId: "seamless-patterns",
          toolVersion: seamless.version,
          params: raster(`data:image/jpeg;base64,${PNG_1X1}`),
        }),
      ]),
      registry,
    );
    expect(parsed.ok && parsed.designs).toHaveLength(1);
    expect(parsed.ok && parsed.skipped.map((s) => s.reason)).toEqual(["unsafe-upload"]);
  });

  it("caps future and inverted timestamps sensibly", () => {
    const parsed = parseDesignsFile(
      fileText([entry({ createdAt: 5_000, updatedAt: 10 })]),
      registry,
    );
    expect(parsed.ok && parsed.designs[0]?.updatedAt).toBe(5_000);
  });
});

describe("readDesignsFile", () => {
  it("refuses oversized files before reading them", async () => {
    const file = {
      size: DESIGNS_FILE_MAX_BYTES + 1,
      text: () => Promise.reject(new Error("read")),
    };
    expect(await readDesignsFile(file as unknown as Blob)).toEqual({
      ok: false,
      error: "too-large",
    });
  });

  it("parses on the main thread without workers", async () => {
    const text = JSON.stringify(buildDesignsFile([entry()], 1));
    const result = await readDesignsFile(new Blob([text]), { createWorker: null });
    expect(result.ok && result.designs).toHaveLength(1);
    expect(await readDesignsFile(new Blob([]), { createWorker: null })).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("falls back to the main thread when the worker fails", async () => {
    const text = JSON.stringify(buildDesignsFile([entry()], 1));
    const result = await readDesignsFile(new Blob([text]), {
      createWorker: () => Promise.reject(new Error("CSP")),
    });
    expect(result.ok).toBe(true);
  });
});
