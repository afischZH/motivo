/**
 * M4b-AP04: the screenshot and the address typed for it stay on the device
 * (never in share links); saved designs keep 4K screenshots and are checked
 * again on import (SVG sanitised, raster size from the header).
 */
import {
  SCREENSHOT_ASSET_RASTER_MAX_EDGE,
  registry,
  screenshotBeautifierTool,
  type ScreenshotBeautifierParams,
} from "@musterli/tool-registry";
import { inflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DESIGNS_FILE_FORMAT, parseDesignsFile } from "../designs/transfer";
import { decodeDesign, encodeDesign } from "./share-codec";

const size = { width: 1600, height: 900 };

/** A PNG whose header claims `width` × `height` (enough for the import check). */
function pngHref(width: number, height: number): string {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

const shot = (width: number, height: number) =>
  ({ kind: "raster", href: pngHref(width, height), width, height, name: "secret.png" }) as const;

function payload(code: string): string {
  const bytes = Uint8Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
  return new TextDecoder().decode(inflateSync(bytes.subarray(1)));
}

const file = (params: Record<string, unknown>) =>
  JSON.stringify({
    format: DESIGNS_FILE_FORMAT,
    version: 1,
    exportedAt: 1,
    designs: [
      {
        id: "abc123",
        toolId: screenshotBeautifierTool.id,
        toolVersion: screenshotBeautifierTool.version,
        name: "Shot",
        seed: 1,
        size,
        params,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
  });

describe("screenshot beautifier: local only", () => {
  it("leaves the screenshot and the address out of share links", () => {
    const params: ScreenshotBeautifierParams = {
      ...screenshotBeautifierTool.defaults,
      screenshot: shot(1280, 800),
      url: "intranet.example/secret",
      radius: 20,
    };
    const enc = encodeDesign({ toolId: screenshotBeautifierTool.id, params, seed: 1, size });
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    const json = payload(enc.value);
    expect(json).not.toMatch(/secret|base64|intranet|"screenshot":|"url":/);
    const dec = decodeDesign(enc.value);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    const p = dec.design.params as ScreenshotBeautifierParams;
    expect(p.screenshot).toBeNull();
    expect(p.url).toBe(screenshotBeautifierTool.defaults.url);
    expect(p.radius).toBe(20);
  });

  it("imports a saved 4K screenshot but nothing larger", () => {
    const edge = SCREENSHOT_ASSET_RASTER_MAX_EDGE;
    const ok = parseDesignsFile(
      file({ ...screenshotBeautifierTool.defaults, screenshot: shot(edge, 2160) }),
      registry,
    );
    expect(ok.ok && ok.skipped).toEqual([]);
    expect(ok.ok && (ok.designs[0]?.params.screenshot as { width: number }).width).toBe(edge);
    // Declared within limits, but the header says otherwise.
    const lying = { ...shot(edge, 2160), href: pngHref(edge + 1, 2160) };
    const bad = parseDesignsFile(
      file({ ...screenshotBeautifierTool.defaults, screenshot: lying }),
      registry,
    );
    expect(bad.ok && bad.skipped.map((s) => s.reason)).toEqual(["unsafe-upload"]);
    const tooBig = parseDesignsFile(
      file({ ...screenshotBeautifierTool.defaults, screenshot: shot(edge + 1, 2160) }),
      registry,
    );
    expect(tooBig.ok && tooBig.designs).toEqual([]);
  });

  it("sanitises an SVG screenshot again on import", () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10" onload="alert(1)"><script>alert(2)</script><foreignObject><div/></foreignObject><rect width="16" height="10"/></svg>';
    const parsed = parseDesignsFile(
      file({
        ...screenshotBeautifierTool.defaults,
        screenshot: { kind: "svg", svg: hostile, width: 16, height: 10, name: "x.svg" },
      }),
      registry,
    );
    expect(parsed.ok && parsed.skipped).toEqual([]);
    if (!parsed.ok) return;
    const svg = (parsed.designs[0]?.params.screenshot as { svg: string }).svg;
    expect(svg).toContain("<rect");
    expect(svg).not.toMatch(/script|onload|foreignObject/i);
  });
});
