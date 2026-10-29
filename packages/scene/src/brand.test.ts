import { contrastRatio, hexToOklch } from "@musterli/engine";
import { describe, expect, it } from "vitest";

import {
  applyBrandKit,
  backgroundBrandColors,
  fontRoleOf,
  mapBrandColors,
  type BrandLogo,
} from "./brand";
import { createScene, createShapeLayer, createTextLayer } from "./factory";
import { fontFamilyFor, type FontRef } from "./fonts";
import { resolveColor, sceneSchema, type Layer, type Scene } from "./schema";
import { TEST_PNG } from "./test-scenes";
import { createStubMeasure } from "./text";
import { LOGO_PLACEHOLDER_SVG } from "./templates/build";

const L = (hex: string) => hexToOklch(hex).l;

const INK = "#1f2937";
const ACCENT = "#f97316";
const SURFACE = "#fef3c7";

describe("mapBrandColors", () => {
  it("gives every slot the brand colour of the closest role", () => {
    const brand = ["#ff6b35", "#f7f7f2", "#0b3d91"]; // orange, off-white, navy (any order)
    expect(mapBrandColors([INK, ACCENT, SURFACE], brand)).toEqual([
      "#0b3d91",
      "#ff6b35",
      "#f7f7f2",
    ]);
  });

  it("uses each brand colour once before using one twice", () => {
    const out = mapBrandColors(
      [INK, ACCENT, SURFACE, "#0ea5e9", "#ffffff"],
      ["#111111", "#e11d48"],
    );
    expect(out).toHaveLength(5);
    expect(new Set(out.slice(0, 2)).size + new Set(out).size).toBeGreaterThanOrEqual(3);
    expect(out[0]).toBe("#111111");
    expect(out[1]).toBe("#e11d48");
  });

  it("keeps dark slots dark and light slots light", () => {
    const palette = [INK, ACCENT, SURFACE];
    // A brand of only mid tones: dark and light slots keep their colour.
    const mids = ["#e11d48", "#22c55e"];
    const out = mapBrandColors(palette, mids);
    expect(out[0]).toBe(INK);
    expect(out[2]).toBe(SURFACE);
    expect(mids).toContain(out[1]);
    // With a dark brand colour available, the dark slot takes it.
    const out2 = mapBrandColors(palette, ["#e11d48", "#1e1b4b", "#22c55e"]);
    expect(out2[0]).toBe("#1e1b4b");
    for (const [i, c] of out2.entries()) {
      const before = L(palette[i] as string);
      if (before < 0.5) expect(L(c)).toBeLessThan(0.5);
      if (before > 0.8) expect(L(c)).toBeGreaterThan(0.8);
    }
  });

  it("is deterministic, normalises and ignores invalid colours", () => {
    const a = mapBrandColors([INK, ACCENT], ["#FFF", "nope", "#000000"]);
    expect(a).toEqual(mapBrandColors([INK, ACCENT], ["#ffffff", "#000000"]));
    expect(mapBrandColors([INK, ACCENT], [])).toEqual([INK, ACCENT]);
  });
});

function textOn(scene: Scene, id: string, color: string, extra: Partial<Layer> = {}): Layer {
  return {
    ...createTextLayer(id, scene.format, "Hallo Welt"),
    color,
    ...extra,
  } as Layer;
}

function sampleScene(): Scene {
  const scene = createScene("square");
  const f = scene.format;
  const panel: Layer = {
    ...createShapeLayer("panel", f, "rect"),
    x: 100,
    y: 100,
    width: 880,
    height: 400,
    fill: "brand-3",
  };
  const title = {
    ...textOn(scene, "title", "brand-1"),
    x: 140,
    y: 140,
    width: 800,
    height: 200,
    fontSize: 90,
    fontRole: "heading",
  } as Layer;
  const body = {
    ...textOn(scene, "body", "brand-1"),
    x: 140,
    y: 360,
    width: 800,
    height: 100,
    fontSize: 36,
  } as Layer;
  const deco: Layer = { ...createShapeLayer("deco", f, "ellipse"), fill: "brand-2" };
  return { ...scene, palette: [INK, ACCENT, SURFACE], layers: [panel, title, body, deco] };
}

const BRAND_FONTS: FontRef[] = [
  { kind: "brand", id: "b1", name: "Brand Display" },
  { kind: "brand", id: "b2", name: "Brand Text" },
];

describe("fontRoleOf", () => {
  it("uses the layer's role, else the largest texts are headings", () => {
    const scene = sampleScene();
    const [, title, body] = scene.layers as [
      Layer,
      Layer & { kind: "text" },
      Layer & { kind: "text" },
    ];
    expect(fontRoleOf(title, scene)).toBe("heading");
    expect(fontRoleOf(body, scene)).toBe("body");
    expect(fontRoleOf({ ...body, fontRole: "heading" }, scene)).toBe("heading");
  });
});

describe("applyBrandKit", () => {
  it("swaps the palette, keeps the slots and is valid", () => {
    const scene = sampleScene();
    const out = applyBrandKit(scene, { colors: ["#ff6b35", "#f7f7f2", "#0b3d91"] });
    expect(out.colors).toBe(true);
    expect(out.scene.palette).toEqual(["#0b3d91", "#ff6b35", "#f7f7f2"]);
    expect(out.scene.layers.map((l) => (l.kind === "text" ? l.color : null))).toEqual([
      null,
      "brand-1",
      "brand-1",
      null,
    ]);
    expect(sceneSchema.safeParse(out.scene).success).toBe(true);
  });

  it("returns the same scene when nothing applies", () => {
    const scene = sampleScene();
    const out = applyBrandKit(scene, { colors: null, fonts: [], logo: null });
    expect(out.scene).toBe(scene);
    expect(out).toMatchObject({ colors: false, fonts: 0, logos: 0 });
    // A palette that maps onto itself changes nothing either.
    expect(applyBrandKit(scene, { colors: scene.palette }).scene).toBe(scene);
  });

  it("freezes the colours of locked layers", () => {
    const scene = sampleScene();
    const locked = {
      ...scene,
      layers: scene.layers.map((l) => (l.id === "deco" ? { ...l, locked: true } : l)),
    };
    const out = applyBrandKit(locked, { colors: ["#0b3d91", "#22c55e", "#ffffff"] });
    const deco = out.scene.layers.find((l) => l.id === "deco");
    expect(deco?.kind === "shape" && deco.fill).toBe(ACCENT);
    const title = out.scene.layers.find((l) => l.id === "title");
    expect(title?.kind === "text" && title.color).toBe("brand-1");
  });

  it("switches a text on a panel to a readable slot when the contrast would drop", () => {
    const scene = sampleScene();
    // Brand: the panel slot (light) and the text slot both end up light.
    const tweaked: Scene = {
      ...scene,
      layers: scene.layers.map((l) =>
        l.id === "body" ? { ...l, color: "brand-2" } : l,
      ) as Layer[],
    };
    const out = applyBrandKit(tweaked, { colors: ["#fde68a", "#fffbeb", "#111827"] });
    const s = out.scene;
    const body = s.layers.find((l) => l.id === "body");
    const panel = s.layers.find((l) => l.id === "panel");
    if (body?.kind !== "text" || panel?.kind !== "shape" || panel.fill === null) {
      throw new Error("layers");
    }
    const ratio = contrastRatio(
      resolveColor(body.color, s.palette),
      resolveColor(panel.fill, s.palette),
    );
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("gives headings the first and body texts the second brand font", () => {
    const scene = sampleScene();
    const out = applyBrandKit(scene, { fonts: BRAND_FONTS }, { measure: createStubMeasure() });
    const fontOf = (id: string) => {
      const l = out.scene.layers.find((x) => x.id === id);
      return l?.kind === "text" ? [l.font?.id, l.fontFamily] : null;
    };
    expect(fontOf("title")).toEqual(["b1", fontFamilyFor(BRAND_FONTS[0] as FontRef)]);
    expect(fontOf("body")).toEqual(["b2", fontFamilyFor(BRAND_FONTS[1] as FontRef)]);
    expect(out.fonts).toBe(2);
    // One brand font: everything gets it.
    const one = applyBrandKit(scene, { fonts: BRAND_FONTS.slice(0, 1) });
    expect(
      one.scene.layers.filter((l) => l.kind === "text").map((l) => l.kind === "text" && l.font?.id),
    ).toEqual(["b1", "b1"]);
  });

  it("keeps the fonts of locked texts", () => {
    const scene = sampleScene();
    const locked = {
      ...scene,
      layers: scene.layers.map((l) => (l.id === "title" ? { ...l, locked: true } : l)),
    };
    const out = applyBrandKit(locked, { fonts: BRAND_FONTS });
    const title = out.scene.layers.find((l) => l.id === "title");
    expect(title?.kind === "text" && title.font?.kind).toBe("library");
    expect(out.fonts).toBe(1);
  });

  it("puts the logo into the logo slot at its aspect ratio and shows it", () => {
    const scene = createScene("square");
    const slot: Layer = {
      id: "logo",
      name: "",
      visible: false,
      locked: false,
      opacity: 1,
      rotation: 0,
      x: 800,
      y: 900,
      width: 200,
      height: 100,
      groupId: null,
      constraints: { h: "end", v: "end", size: "short", bleed: false },
      kind: "logo",
      assetId: null,
      image: { kind: "svg", svg: LOGO_PLACEHOLDER_SVG, width: 240, height: 96, name: "" },
    };
    const logo: BrandLogo = {
      image: { ...TEST_PNG, width: 100, height: 100 },
      assetId: "a1",
      name: "Mark",
    };
    const out = applyBrandKit({ ...scene, layers: [slot] }, { logo });
    const placed = out.scene.layers[0];
    expect(out.logos).toBe(1);
    expect(placed).toMatchObject({ kind: "logo", visible: true, assetId: "a1", name: "Mark" });
    // A square logo in a 200 x 100 slot anchored bottom right: 100 x 100 at the right edge.
    expect(placed).toMatchObject({ x: 900, y: 900, width: 100, height: 100 });
    expect(sceneSchema.safeParse(out.scene).success).toBe(true);
  });

  it("adds a logo layer only when asked and the scene has none", () => {
    const scene = sampleScene();
    const logo: BrandLogo = { image: TEST_PNG, assetId: null, name: "Logo" };
    expect(applyBrandKit(scene, { logo }).logos).toBe(0);
    const out = applyBrandKit(scene, { logo }, { newLogoId: "o1" });
    expect(out.logos).toBe(1);
    expect(out.scene.layers.at(-1)).toMatchObject({ id: "o1", kind: "logo" });
  });

  it("keeps locked logos", () => {
    const scene = createScene("square");
    const slot = {
      id: "logo",
      name: "",
      visible: true,
      locked: true,
      opacity: 1,
      rotation: 0,
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      groupId: null,
      constraints: { h: "start", v: "start", size: "short", bleed: false },
      kind: "logo",
      assetId: "old",
      image: TEST_PNG,
    } satisfies Layer;
    const out = applyBrandKit(
      { ...scene, layers: [slot] },
      { logo: { image: TEST_PNG, assetId: "new", name: "" } },
      { newLogoId: "o1" },
    );
    expect(out.scene.layers).toHaveLength(1);
    expect(out.scene.layers[0]).toMatchObject({ assetId: "old" });
  });
});

describe("backgroundBrandColors", () => {
  it("leaves out the colours texts use", () => {
    const scene = sampleScene();
    expect(backgroundBrandColors(scene)).toEqual([ACCENT, SURFACE]);
  });

  it("falls back to the whole palette when too few are left", () => {
    const scene = { ...sampleScene(), palette: [INK, ACCENT] };
    expect(backgroundBrandColors(scene)).toEqual([INK, ACCENT]);
  });
});
