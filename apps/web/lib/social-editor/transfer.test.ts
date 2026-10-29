import {
  createBackgroundLayer,
  createImageLayer,
  createLogoLayer,
  createScene,
  createTextLayer,
  type Scene,
  type SceneImage,
} from "@musterli/scene";
import { registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import { parseSocialFile } from "./transfer";
import {
  SOCIAL_FILE_FORMAT,
  SOCIAL_FILE_MAX_BYTES,
  SOCIAL_FILE_MAX_DESIGNS,
  socialFileName,
  socialFileTexts,
} from "./transfer-format";

const PNG_1PX_DATA =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==";
const PNG: SceneImage = {
  kind: "raster",
  href: `data:image/png;base64,${PNG_1PX_DATA}`,
  width: 1,
  height: 1,
  name: "pixel.png",
};
const SVG: SceneImage = {
  kind: "svg",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/></svg>',
  width: 10,
  height: 10,
  name: "logo.svg",
};

function scene(images: SceneImage[] = [PNG], params?: Record<string, unknown>): Scene {
  const s = createScene("square");
  const tool = registry.get("mesh-gradient");
  if (!tool) throw new Error("mesh-gradient missing");
  return {
    ...s,
    layers: [
      createBackgroundLayer("bg", s.format, {
        id: tool.id,
        version: tool.version,
        params: params ?? (tool.defaults as Record<string, unknown>),
      }),
      createTextLayer("t", s.format, "Hallo"),
      ...images.map((image, i) =>
        i === 0
          ? createImageLayer(`i${i}`, s.format, image)
          : createLogoLayer(`i${i}`, s.format, image, null),
      ),
    ],
  };
}

function file(designs: unknown[], over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: SOCIAL_FILE_FORMAT,
    version: 1,
    exportedAt: 1,
    designs,
    ...over,
  });
}

const entry = (s: unknown, over: Record<string, unknown> = {}) => ({
  id: "d1",
  name: "Post",
  createdAt: 1,
  updatedAt: 2,
  scene: s,
  ...over,
});

describe("social designs file", () => {
  it("round-trips an export", async () => {
    const texts = await socialFileTexts(
      [{ id: "d1", name: "Post", createdAt: 1, updatedAt: 2, scene: scene([PNG, SVG]) }],
      5,
    );
    expect(texts).toHaveLength(1);
    const result = parseSocialFile(texts[0] ?? "", registry);
    expect(result).toMatchObject({ ok: true, skipped: [] });
    if (!result.ok) return;
    expect(result.designs[0]?.scene.layers).toHaveLength(4);
    expect(socialFileName(new Date(2026, 9, 29))).toBe("musterli-social-v1-2026-10-29.json");
    expect(socialFileName(new Date(2026, 9, 29), 1, 3)).toBe(
      "musterli-social-v1-2026-10-29-2.json",
    );
  });

  it("splits large exports into files under the limit", async () => {
    const designs = Array.from({ length: 3 }, (_, i) => ({
      id: `d${i}`,
      name: "x",
      createdAt: 1,
      updatedAt: 1,
      scene: scene(),
    }));
    const one = (await socialFileTexts(designs.slice(0, 1), 1))[0] ?? "";
    const texts = await socialFileTexts(designs, 1, one.length + 10);
    expect(texts.length).toBeGreaterThan(1);
    for (const text of texts) expect(parseSocialFile(text, registry).ok).toBe(true);
  });

  it("refuses files that are not social designs files", () => {
    const cases: [string, string][] = [
      ["", "empty"],
      ["   ", "empty"],
      ["{", "malformed"],
      ["[]", "wrong-format"],
      ['"text"', "wrong-format"],
      [JSON.stringify({ format: "motivo-designs", version: 1, designs: [] }), "designs-file"],
      [JSON.stringify({ format: "motivo-brandkit", version: 1, palettes: [] }), "brand-kit-file"],
      [JSON.stringify({ format: "other", version: 1, designs: [] }), "wrong-format"],
      [file([], { designs: {} }), "wrong-format"],
      [file([], { version: 2 }), "unsupported-version"],
      [file(Array(SOCIAL_FILE_MAX_DESIGNS + 1).fill(0)), "too-many"],
      ['{"format":"motivo-social","version":1,"designs":[],"__proto__":{"x":1}}', "forbidden-keys"],
      [file([{ ...entry(scene()), scene: { constructor: { prototype: {} } } }]), "forbidden-keys"],
    ];
    for (const [text, error] of cases) {
      expect(parseSocialFile(text, registry), text.slice(0, 60)).toEqual({ ok: false, error });
    }
    const huge = " ".repeat(SOCIAL_FILE_MAX_BYTES + 1);
    expect(parseSocialFile(huge, registry)).toEqual({ ok: false, error: "too-large" });
  });

  it("skips manipulated designs and keeps the good ones", () => {
    const good = scene();
    const s = scene();
    const text = s.layers[1];
    const image = s.layers[2];
    if (!text || !image || image.kind !== "image") throw new Error("fixture");
    const with2 = (layer: unknown) => ({ ...s, layers: [s.layers[0], s.layers[1], layer] });
    const designs = [
      entry(good),
      entry(good, { id: "../../etc" }),
      entry(good, { createdAt: -1 }),
      entry({ ...good, version: 7 }),
      entry({ ...s, layers: [...s.layers, { ...text }] }),
      entry({ ...s, layers: [{ ...s.layers[0], toolId: "no-such-tool" }, ...s.layers.slice(1)] }),
      entry(scene([PNG], { palette: ["not a colour"] })),
      entry(with2({ ...image, image: { ...PNG, href: `data:image/jpeg;base64,${PNG_1PX_DATA}` } })),
      entry(
        with2({
          ...image,
          image: { ...PNG, width: 1, height: 1, href: "data:image/png;base64,AAAA" },
        }),
      ),
      entry(
        with2({
          ...image,
          image: { ...PNG, href: `data:image/png;base64,${PNG_1PX_DATA.slice(0, -2)}` },
        }),
      ),
      entry(with2({ ...image, image: { ...PNG, href: "javascript:alert(1)" } })),
      entry(with2({ ...image, image: { ...SVG, svg: "<html><script>alert(1)</script></html>" } })),
      entry(with2({ ...text, text: 5 })),
    ];
    const result = parseSocialFile(file(designs), registry);
    if (!result.ok) throw new Error(result.error);
    expect(result.designs).toHaveLength(1);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      "invalid",
      "invalid",
      "invalid-scene",
      "invalid-scene",
      "unknown-tool",
      "invalid-params",
      "unsafe-upload",
      "unsafe-upload",
      "unsafe-upload",
      "invalid-scene",
      "unsafe-upload",
      "invalid-scene",
    ]);
  });

  it("sanitises SVG pictures again on import", () => {
    const evil: SceneImage = {
      ...SVG,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10" onclick="x()"/><foreignObject><div>x</div></foreignObject><image href="https://evil.example/x.png"/></svg>',
    };
    const result = parseSocialFile(file([entry(scene([PNG, evil]))]), registry);
    if (!result.ok) throw new Error(result.error);
    const logo = result.designs[0]?.scene.layers[3];
    if (logo?.kind !== "logo" || logo.image.kind !== "svg") throw new Error("missing logo");
    expect(logo.image.svg).not.toMatch(/script|onload|onclick|foreignObject|evil\.example/i);
    expect(logo.image.svg).toContain("<rect");
  });

  it("sanitises uploads inside the background's tool params again", () => {
    const tool = registry.get("seamless-patterns");
    if (!tool) throw new Error("seamless-patterns missing");
    const withUpload = (svg: string): Scene => {
      const s = scene();
      const params = {
        ...(tool.defaults as Record<string, unknown>),
        upload: { kind: "svg", svg, width: 10, height: 10, name: "logo.svg" },
      };
      const bg = createBackgroundLayer("bg", s.format, {
        id: tool.id,
        version: tool.version,
        params,
      });
      return { ...s, layers: [bg, ...s.layers.slice(1)] };
    };
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><foreignObject><div/></foreignObject><image href="https://evil.example/x.png"/><rect width="10" height="10" fill="red"/></svg>';
    const result = parseSocialFile(
      file([
        entry(withUpload(hostile)),
        entry(withUpload("<html><body>x</body></html>"), { id: "d2" }),
      ]),
      registry,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.skipped.map((s) => s.reason)).toEqual(["unsafe-upload"]);
    const bg = result.designs[0]?.scene.layers[0];
    if (bg?.kind !== "background") throw new Error("missing background");
    const upload = bg.params.upload as { svg: string };
    expect(upload.svg).toContain("<rect");
    expect(upload.svg).not.toMatch(/script|onload|foreignObject|evil\.example/i);
  });

  it("refuses raster pictures whose real size exceeds the declared one", () => {
    // A PNG header claiming 4096 x 1 px, declared as 1 x 1.
    const bytes = Uint8Array.from(atob(PNG_1PX_DATA), (c) => c.charCodeAt(0));
    bytes.set([0, 0, 0x10, 0x00], 16);
    const big: SceneImage = {
      ...PNG,
      href: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`,
    };
    const result = parseSocialFile(file([entry(scene([big]))]), registry);
    if (!result.ok) throw new Error(result.error);
    expect(result.designs).toEqual([]);
    expect(result.skipped.map((s) => s.reason)).toEqual(["unsafe-upload"]);
  });
});
