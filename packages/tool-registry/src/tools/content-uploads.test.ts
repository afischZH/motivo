/**
 * M4-AP06b: own background picture in Glass and Border Effects, content per
 * tile in the Bento Grid (text, icons, own graphics, tile and grid
 * pictures): schema caps, tile key rule, escaping, code placeholders and
 * local-only uploads.
 */
import { bentoLayout, createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { hasLocalContent, withoutDerivedParams } from "../image-input";
import { createRenderContext } from "../render";
import { renderStatic } from "../testing";
import type { CssOutput } from "../types";
import {
  BENTO_SUBTITLE_MAX,
  BENTO_TILES_MAX,
  BENTO_TILE_IMAGES_MAX,
  BENTO_TITLE_MAX,
  bentoTileKey,
  tileContentRecordSchema,
  tileImagesRecordSchema,
  type BentoGridParams,
  type TileContent,
} from "./bento-grid";
import type { GlassEffectsParams } from "./glass-effects";
import { bentoGridTool, glassEffectsTool } from "./index";

const size = { width: 1200, height: 800 };
const ctx = (seed = 1) => createRenderContext(seed, size);

/** A 1x1 PNG. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const raster = (name = "photo.png") =>
  ({ kind: "raster", href: PNG, width: 1, height: 1, name }) as const;
const svgAsset = {
  kind: "svg",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>',
  width: 10,
  height: 10,
  name: "logo.svg",
} as const;

const HOSTILE = '</text><script>alert(1)</script><img src=x onerror="alert(2)">&';

function extra<P>(
  tool: {
    extraExports?: readonly { id: string; render(p: P, c: ReturnType<typeof ctx>): string }[];
  },
  id: string,
  p: P,
): string {
  const e = tool.extraExports?.find((x) => x.id === id);
  if (!e) throw new Error(`missing extra ${id}`);
  return e.render(p, ctx());
}

// ---------------------------------------------------------------------------
// Glass
// ---------------------------------------------------------------------------

describe("glass-effects: own background picture", () => {
  const glass = glassEffectsTool.defaults;
  const withImage: GlassEffectsParams = { ...glass, backgroundImage: raster() };
  const css = (p: GlassEffectsParams): CssOutput =>
    renderStatic(glassEffectsTool, p, 1, size) as CssOutput;

  it("uses the picture as the stage in preview and SVG twin", () => {
    const out = css(withImage);
    expect(out.css).toContain(`background-image: url("${PNG}");`);
    expect(out.css).toContain("background-size: cover;");
    expect(out.previewSvg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(out.previewSvg).toContain(`xlink:href="${PNG}"`);
    const contain = css({ ...withImage, imageFit: "contain", imagePosition: "top" });
    expect(contain.css).toContain("background-size: contain;");
    expect(contain.css).toContain("background-position: top;");
    expect(contain.previewSvg).toContain('preserveAspectRatio="xMidYMin meet"');
  });

  it("embeds a sanitised SVG picture as a data URI, never as markup", () => {
    const out = css({ ...glass, backgroundImage: svgAsset });
    expect(out.css).toContain('url("data:image/svg+xml;base64,');
    expect(out.previewSvg).not.toContain('<rect width="10"');
  });

  it("writes a placeholder into the code, the picture only when embedding", () => {
    const html = extra(glassEffectsTool, "html", withImage);
    expect(html).toContain('background-image: url("your-image.png")');
    expect(html).toContain("/* Replace your-image.png with the path to your own picture. */");
    expect(html).not.toContain("data:image");
    for (const id of ["css", "tailwind"]) {
      expect(extra(glassEffectsTool, id, withImage)).not.toContain("data:image/png");
    }
    const embedded = extra(glassEffectsTool, "html", { ...withImage, embedImage: true });
    expect(embedded).toContain(`url("${PNG}")`);
    expect(embedded).not.toContain("your-image");
    const jpeg = extra(glassEffectsTool, "html", {
      ...glass,
      backgroundImage: { ...raster(), href: PNG.replace("png", "jpeg") },
    });
    expect(jpeg).toContain("your-image.jpg");
  });

  it("keeps image exports for border and glow, with the picture", () => {
    const border: GlassEffectsParams = { ...withImage, effect: "gradient-border" };
    expect(glassEffectsTool.exportsFor?.(border)).toEqual(["png", "webp"]);
    expect(glassEffectsTool.exportsFor?.(withImage)).toEqual([]);
    expect(css(border).previewSvg).toContain(PNG);
  });

  it("says that the contrast of text on a picture cannot be checked", () => {
    expect(glassEffectsTool.advisories?.(withImage, ctx()).map((a) => a.id)).toEqual([
      "image-contrast",
    ]);
  });

  it("never puts the picture or its settings into share links", () => {
    const p: GlassEffectsParams = { ...withImage, imageFit: "contain", embedImage: true };
    expect(hasLocalContent(glassEffectsTool, p)).toBe(true);
    const shared = withoutDerivedParams(glassEffectsTool, p);
    expect(shared.backgroundImage).toBeNull();
    expect(shared.imageFit).toBe("cover");
    expect(shared.embedImage).toBe(false);
  });

  it("upgrades params from before the picture option", () => {
    const added = ["backgroundImage", "imageFit", "imagePosition", "embedImage"];
    const old = Object.fromEntries(Object.entries(glass).filter(([k]) => !added.includes(k)));
    const migrated = glassEffectsTool.schema.safeParse(glassEffectsTool.migrateParams?.(old));
    expect(migrated.success && migrated.data).toEqual(glass);
  });

  it("randomize keeps the picture", () => {
    const next = glassEffectsTool.randomize(createRng(3), withImage, new Set());
    expect(next.backgroundImage).toBe(withImage.backgroundImage);
  });

  it("accepts pictures up to 2048 px only", () => {
    const shape = glassEffectsTool.schema.shape.backgroundImage;
    expect(shape.safeParse({ ...raster(), width: 2048, height: 1365 }).success).toBe(true);
    expect(shape.safeParse({ ...raster(), width: 2049, height: 10 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bento
// ---------------------------------------------------------------------------

const bento = bentoGridTool.defaults;
const editor = (() => {
  const e = bentoGridTool.regionEditor;
  if (!e) throw new Error("bento-grid has no region editor");
  return e;
})();
const content = (over: Partial<TileContent> = {}): TileContent => ({
  title: "",
  subtitle: "",
  showIcon: false,
  icon: "star",
  graphicPosition: "center",
  graphicSize: 100,
  ...over,
});
const set = (p: BentoGridParams, id: string, patch: Record<string, unknown>) =>
  editor.set(p, id, patch, ctx()) as BentoGridParams;

describe("bento-grid: tile content schema", () => {
  it("caps text length, entries and key shape", () => {
    expect(
      tileContentRecordSchema.safeParse({ t1: content({ title: "x".repeat(BENTO_TITLE_MAX) }) })
        .success,
    ).toBe(true);
    expect(
      tileContentRecordSchema.safeParse({ t1: content({ title: "x".repeat(BENTO_TITLE_MAX + 1) }) })
        .success,
    ).toBe(false);
    expect(
      tileContentRecordSchema.safeParse({
        t1: content({ subtitle: "x".repeat(BENTO_SUBTITLE_MAX + 1) }),
      }).success,
    ).toBe(false);
    for (const key of ["t0", "t65", "x1", "t1 ", "t01"]) {
      expect(tileContentRecordSchema.safeParse({ [key]: content() }).success, key).toBe(false);
    }
    // Zod drops prototype keys instead of copying them.
    const proto = tileContentRecordSchema.safeParse(JSON.parse('{"__proto__": {"title": "x"}}'));
    expect(proto.success && Object.keys(proto.data)).toEqual([]);
    const all = Object.fromEntries(
      Array.from({ length: BENTO_TILES_MAX }, (_, i) => [bentoTileKey(i), content({ title: "a" })]),
    );
    expect(tileContentRecordSchema.safeParse(all).success).toBe(true);
    // Unknown fields are rejected (strict objects).
    expect(tileContentRecordSchema.safeParse({ t1: { ...content(), html: "<b>" } }).success).toBe(
      false,
    );
  });

  it("caps the number and total size of tile pictures", () => {
    const many = Object.fromEntries(
      Array.from({ length: BENTO_TILE_IMAGES_MAX + 1 }, (_, i) => [
        bentoTileKey(i),
        { graphic: raster(), background: null },
      ]),
    );
    expect(tileImagesRecordSchema.safeParse(many).success).toBe(false);
    const huge = `data:image/png;base64,${"A".repeat(5_000_000)}`;
    const heavy = {
      t1: { graphic: { ...raster(), href: huge }, background: { ...raster(), href: huge } },
      t2: { graphic: { ...raster(), href: huge }, background: null },
    };
    expect(tileImagesRecordSchema.safeParse(heavy).success).toBe(false);
  });

  it("upgrades params from before tile content", () => {
    const old: Record<string, unknown> = { ...bento };
    delete old.tileContent;
    delete old.tileImages;
    delete old.backgroundImage;
    const migrated = bentoGridTool.schema.safeParse(bentoGridTool.migrateParams?.(old));
    expect(migrated.success && migrated.data).toEqual(bento);
  });
});

describe("bento-grid: tile keys", () => {
  const layout = (p: BentoGridParams) =>
    bentoLayout(createRng(p.layoutSeed), {
      columns: p.columns,
      rows: p.rows,
      tiles: p.tiles,
      minSpan: p.minSpan,
      maxSpan: Math.max(p.minSpan, p.maxSpan),
    }).tiles;

  it("are t1..tn in reading order of the layout", () => {
    const regions = editor.regions(bento, ctx());
    expect(regions.map((r) => r.id)).toEqual(layout(bento).map((_, i) => `t${i + 1}`));
    const ys = regions.map((r) => ({ y: r.y, x: r.x }));
    expect(ys).toEqual([...ys].sort((a, b) => a.y - b.y || a.x - b.x));
  });

  it("stay put when colours, spacing, seed or size change", () => {
    const ids = editor.regions(bento, ctx()).map((r) => r.id);
    const restyled = {
      ...bento,
      palette: ["#000000", "#ffffff"],
      gap: 4,
      radius: 0,
      fill: "single" as const,
    };
    expect(
      editor
        .regions(restyled, createRenderContext(99, { width: 600, height: 900 }))
        .map((r) => r.id),
    ).toEqual(ids);
  });

  it("content follows the tile number when the layout re-rolls", () => {
    const p = set(bento, "t2", { title: "Second" });
    const rerolled = { ...p, layoutSeed: 12345 };
    expect(editor.values(rerolled, "t2", ctx())?.title).toBe("Second");
    const svg = renderStatic(bentoGridTool, rerolled, 1, size) as string;
    expect(svg).toContain(">Second</text>");
    // Fewer tiles: the content stays stored but is not drawn.
    const fewer = { ...p, tiles: 1, maxSpan: 8 };
    expect(editor.regions(fewer, ctx()).length).toBeLessThan(2);
    expect(renderStatic(bentoGridTool, fewer, 1, size)).not.toContain("Second");
    expect(editor.editedCount(fewer)).toBe(1);
  });
});

describe("bento-grid: tile editor", () => {
  it("stores text in tileContent and pictures in tileImages", () => {
    let p = set(bento, "t1", { title: "Hello", showIcon: true, icon: "heart" });
    p = set(p, "t1", { graphic: raster("g.png") });
    p = set(p, "t3", { background: svgAsset });
    expect(p.tileContent.t1).toMatchObject({ title: "Hello", showIcon: true, icon: "heart" });
    expect(p.tileImages.t1?.graphic?.name).toBe("g.png");
    expect(p.tileContent.t3).toBeUndefined();
    expect(p.tileImages.t3?.background?.name).toBe("logo.svg");
    expect(editor.editedCount(p)).toBe(2);
    expect(
      editor
        .regions(p, ctx())
        .filter((r) => r.edited)
        .map((r) => r.id),
    ).toEqual(["t1", "t3"]);
  });

  it("removes a tile's entry when it is empty again", () => {
    let p = set(bento, "t1", { title: "Hi" });
    p = set(p, "t1", { title: "" });
    expect(p.tileContent).toEqual({});
    p = set(p, "t2", { graphic: raster() });
    p = set(p, "t2", { graphic: null });
    expect(p.tileImages).toEqual({});
  });

  it("refuses invalid edits and unknown tiles", () => {
    expect(set(bento, "t1", { title: "x".repeat(BENTO_TITLE_MAX + 1) })).toBe(bento);
    expect(set(bento, "t99", { title: "x" })).toBe(bento);
    expect(set(bento, "t1", { icon: "no-such-shape" })).toBe(bento);
    expect(
      set(bento, "t1", {
        graphic: { kind: "raster", href: "javascript:alert(1)", width: 1, height: 1, name: "" },
      }),
    ).toBe(bento);
  });

  it("resets one tile or all", () => {
    let p = set(bento, "t1", { title: "A" });
    p = set(p, "t2", { background: raster() });
    expect(editor.reset(p, "t1")).toMatchObject({ tileContent: {}, tileImages: p.tileImages });
    expect(editor.reset(p, null)).toMatchObject({ tileContent: {}, tileImages: {} });
  });

  // M4-AP09: inherited keys (`"toString" in {}` is true) are not tiles with content.
  it("treats inherited keys as unedited", () => {
    const p = set(bento, "t1", { title: "A" });
    for (const id of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(editor.reset(p, id)).toBe(p);
      expect(editor.reset(bento, id)).toBe(bento);
    }
    const regions = editor.regions(bento, ctx());
    expect(regions.some((r) => r.edited)).toBe(false);
  });

  it("keeps content when Space rolls a new variant", () => {
    const p = set(bento, "t1", { title: "Keep", background: raster() });
    const next = bentoGridTool.randomize(createRng(5), p, new Set());
    expect(next.tileContent).toBe(p.tileContent);
    expect(next.tileImages).toBe(p.tileImages);
  });
});

describe("bento-grid: rendering and exports", () => {
  const p = (() => {
    let q = set(bento, "t1", {
      title: HOSTILE,
      subtitle: "Sub & more",
      showIcon: true,
      icon: "heart",
    });
    q = set(q, "t1", { graphic: raster("g.png"), graphicPosition: "left" });
    q = set(q, "t2", { background: raster("bg.jpg"), title: "On photo" });
    return { ...q, backgroundImage: raster("grid.png") } as BentoGridParams;
  })();

  it("draws escaped text, icons and pictures in the SVG", () => {
    const svg = renderStatic(bentoGridTool, p, 1, size) as string;
    expect(svg).not.toMatch(/<script|<img|onerror="/);
    // The title wraps (and ends in an ellipsis) in a small tile; its start is escaped.
    expect(svg).toContain(">&lt;/text&gt;");
    expect(svg).toContain("Sub &amp; more");
    expect(svg.match(/<text /g)?.length).toBe(svg.match(/<\/text>/g)?.length);
    expect(svg).toContain('preserveAspectRatio="xMinYMid meet"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain(`xlink:href="${PNG}"`);
    expect(svg).toContain("clip-path=");
    expect(svg).not.toContain("foreignObject");
  });

  it("is unchanged without content (presets keep their snapshots)", () => {
    const plain = renderStatic(bentoGridTool, bento, 1, size) as string;
    expect(plain).not.toContain("<defs>");
    expect(plain).not.toContain("<text");
  });

  it("writes escaped HTML and placeholder pictures into CSS Grid and Tailwind", () => {
    for (const id of ["css-grid", "tailwind"]) {
      const code = extra(bentoGridTool, id, p);
      expect(code, id).not.toContain("data:image");
      expect(code, id).not.toMatch(/<script|<img src=x|onerror="/);
      expect(code, id).toContain("&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(code, id).toContain("Sub &amp; more</p>");
      expect(code, id).toContain('src="tile-1-graphic.png"');
      expect(code, id).toContain("tile-2-background.png");
      expect(code, id).toContain("bento-background.png");
      expect(code, id).toContain(
        "<!-- Tile 1 graphic: replace tile-1-graphic.png with your own image. -->",
      );
      expect(code, id).toContain('viewBox="-50 -50 100 100"');
    }
    const html = extra(bentoGridTool, "css-grid", p);
    expect(html).toContain("url('tile-2-background.png') center / cover no-repeat");
    expect(html).toContain("url('bento-background.png') center / cover no-repeat");
  });

  it("keeps uploads out of share links, text and icons in", () => {
    expect(hasLocalContent(bentoGridTool, p)).toBe(true);
    const shared = withoutDerivedParams(bentoGridTool, p);
    expect(shared.tileImages).toEqual({});
    expect(shared.backgroundImage).toBeNull();
    expect(shared.tileContent).toEqual(p.tileContent);
    const textOnly = { ...p, tileImages: {}, backgroundImage: null };
    expect(hasLocalContent(bentoGridTool, textOnly)).toBe(false);
  });
});
