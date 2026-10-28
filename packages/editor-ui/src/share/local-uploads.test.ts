/**
 * M4-AP06b: uploads (local params) never travel in share links; links leave
 * private keys out entirely and get the defaults back on decode.
 */
import {
  bentoGridTool,
  glassEffectsTool,
  registry,
  type BentoGridParams,
  type GlassEffectsParams,
} from "@musterli/tool-registry";
import { deflateSync, inflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import { pasteBelongsTo } from "../controls/image-field";
import { designsFileTexts, parseDesignsFile, DESIGNS_FILE_FORMAT } from "../designs/transfer";
import { decodeDesign, encodeDesign } from "./share-codec";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const raster = { kind: "raster", href: PNG, width: 1, height: 1, name: "secret.png" } as const;
const size = { width: 1200, height: 800 };

function payload(code: string): string {
  const bytes = Uint8Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
  return new TextDecoder().decode(inflateSync(bytes.subarray(1)));
}

describe("share links without uploads", () => {
  const bento: BentoGridParams = {
    ...bentoGridTool.defaults,
    tileContent: {
      t1: {
        title: "Hello <b>",
        subtitle: "",
        showIcon: true,
        icon: "heart",
        graphicPosition: "center",
        graphicSize: 100,
      },
    },
    tileImages: { t1: { graphic: raster, background: raster } },
    backgroundImage: raster,
  };

  it("keeps bento text and icons, drops every picture", () => {
    const enc = encodeDesign({ toolId: "bento-grid", params: bento, seed: 1, size });
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    const json = payload(enc.value);
    expect(json).not.toContain("secret.png");
    expect(json).not.toContain("base64");
    expect(json).not.toContain("tileImages");
    expect(json).toContain("Hello <b>");
    const dec = decodeDesign(enc.value);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    const p = dec.design.params as BentoGridParams;
    expect(p.tileContent).toEqual(bento.tileContent);
    expect(p.tileImages).toEqual({});
    expect(p.backgroundImage).toBeNull();
  });

  it("drops the glass picture and its settings", () => {
    const glass: GlassEffectsParams = {
      ...glassEffectsTool.defaults,
      backgroundImage: raster,
      imageFit: "contain",
      embedImage: true,
    };
    const enc = encodeDesign({ toolId: "glass-effects", params: glass, seed: 1, size });
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    expect(payload(enc.value)).not.toMatch(/secret|backgroundImage|imageFit|embedImage/);
    const dec = decodeDesign(enc.value);
    expect(dec.ok && dec.design.params).toEqual(glassEffectsTool.defaults);
  });

  it("ignores uploads planted in a crafted link", () => {
    // An old-style link that carries the keys: they are reset on decode.
    const crafted = { ...glassEffectsTool.defaults, backgroundImage: raster };
    const dec = decodeDesign(
      encodeRaw(["glass-effects", glassEffectsTool.version, 1, 1200, 800, crafted]),
    );
    expect(dec.ok && (dec.design.params as GlassEffectsParams).backgroundImage).toBeNull();
  });

  // M4-AP09: local params in a link are ignored, not validated. Before, a
  // crafted value made the whole link fail as "invalid-params" (and a huge
  // planted upload was run through the schema first).
  it("ignores malformed local params in a crafted link instead of rejecting it", () => {
    const junk: unknown[] = [
      "javascript:alert(1)",
      { kind: "svg", svg: "<svg onload=alert(1)>", width: -1, height: 0, name: 1 },
      { t1: { graphic: "junk", background: { kind: "raster", href: "data:text/html,x" } } },
      // Own `__proto__` key, as JSON.parse creates it from a link.
      JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'),
    ];
    for (const value of junk) {
      const crafted = {
        ...bentoGridTool.defaults,
        tileContent: bento.tileContent,
        tileImages: value,
        backgroundImage: value,
      };
      const dec = decodeDesign(
        encodeRaw(["bento-grid", bentoGridTool.version, 1, 1200, 800, crafted]),
      );
      expect(dec.ok).toBe(true);
      if (!dec.ok) continue;
      const p = dec.design.params as BentoGridParams;
      expect(p.tileImages).toEqual({});
      expect(p.backgroundImage).toBeNull();
      expect(p.tileContent).toEqual(bento.tileContent);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
    const glass = decodeDesign(
      encodeRaw([
        "glass-effects",
        glassEffectsTool.version,
        1,
        1200,
        800,
        { ...glassEffectsTool.defaults, backgroundImage: junk[1], imageFit: "evil", embedImage: 1 },
      ]),
    );
    expect(glass.ok && glass.design.params).toEqual(glassEffectsTool.defaults);
  });
});

/** A link payload packed by hand (bypasses `encodeDesign`, which strips private keys). */
function encodeRaw(value: unknown): string {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  const deflated = deflateSync(raw);
  const bytes = new Uint8Array(deflated.length + 1);
  bytes[0] = 1;
  bytes.set(deflated, 1);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("design files with nested uploads", () => {
  const entry = (params: Record<string, unknown>) => ({
    id: "abc123",
    toolId: "bento-grid",
    toolVersion: bentoGridTool.version,
    name: "Bento",
    seed: 1,
    size,
    params,
    createdAt: 1,
    updatedAt: 2,
  });
  const file = (params: Record<string, unknown>) =>
    JSON.stringify({
      format: DESIGNS_FILE_FORMAT,
      version: 1,
      exportedAt: 1,
      designs: [entry(params)],
    });

  it("sanitises SVG tile pictures again", () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10"/></svg>';
    const params = {
      ...bentoGridTool.defaults,
      tileImages: {
        t2: {
          graphic: { kind: "svg", svg: hostile, width: 10, height: 10, name: "x.svg" },
          background: null,
        },
      },
    };
    const parsed = parseDesignsFile(file(params), registry);
    expect(parsed.ok && parsed.skipped).toEqual([]);
    if (!parsed.ok) return;
    const svg = (
      parsed.designs[0]?.params.tileImages as Record<string, { graphic: { svg: string } }>
    ).t2?.graphic.svg;
    expect(svg).toContain("<rect");
    expect(svg).not.toMatch(/script|onload/i);
  });

  it("skips designs with a fake raster picture in a tile", () => {
    const fake = `data:image/png;base64,${btoa("<svg onload=alert(1)>  ")}`;
    const params = {
      ...bentoGridTool.defaults,
      tileImages: { t1: { graphic: null, background: { ...raster, href: fake } } },
    };
    const parsed = parseDesignsFile(file(params), registry);
    expect(parsed.ok && parsed.skipped.map((s) => s.reason)).toEqual(["unsafe-upload"]);
  });

  it("keeps a valid grid picture", () => {
    const parsed = parseDesignsFile(
      file({ ...bentoGridTool.defaults, backgroundImage: raster }),
      registry,
    );
    expect(parsed.ok && parsed.designs[0]?.params.backgroundImage).toEqual(raster);
  });

  // M4-AP09: the largest Bento design (all tile pictures plus a grid photo, about
  // 21 MB) was over the old 20 MiB import limit: its own export could not be imported.
  it("imports the export of a Bento design with the largest pictures again", async () => {
    const png = Uint8Array.from(atob(PNG.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
    const padded = (bytes: number) => {
      const out = new Uint8Array(bytes);
      out.set(png);
      return `data:image/png;base64,${Buffer.from(out).toString("base64")}`;
    };
    const tile = { ...raster, href: padded(4_499_000) };
    const photo = { ...raster, href: padded(6_749_000) };
    const params = {
      ...bentoGridTool.defaults,
      tileImages: {
        t1: { graphic: tile, background: null },
        t2: { graphic: tile, background: null },
      },
      backgroundImage: photo,
    };
    expect(bentoGridTool.schema.safeParse(params).success).toBe(true);
    const texts = await designsFileTexts([entry(params)], 1);
    expect(texts).toHaveLength(1);
    expect(texts[0]?.length).toBeGreaterThan(20 * 1024 * 1024);
    const parsed = parseDesignsFile(texts[0] ?? "", registry);
    expect(parsed.ok && parsed.skipped).toEqual([]);
    expect(parsed.ok && parsed.designs[0]?.params.backgroundImage).toEqual(photo);
  });
});

describe("paste target", () => {
  it("goes to fields inside an open dialog only", () => {
    document.body.innerHTML =
      '<div id="panel"><div id="a"></div></div><div role="dialog" data-state="open"><div id="b"></div></div>';
    const a = document.getElementById("a");
    const b = document.getElementById("b");
    expect(pasteBelongsTo(a, document.body)).toBe(false);
    expect(pasteBelongsTo(b, document.body)).toBe(true);
    document.querySelector('[role="dialog"]')?.setAttribute("data-state", "closed");
    expect(pasteBelongsTo(a, document.body)).toBe(true);
    const input = document.createElement("input");
    expect(pasteBelongsTo(a, input)).toBe(false);
  });
});
