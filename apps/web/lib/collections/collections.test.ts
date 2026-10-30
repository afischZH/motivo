/**
 * Contract for the curated collections: valid, distinct colours inside the
 * sRGB gamut, unique ids and slugs, texts in every enabled locale (Swiss
 * German without Eszett or dashes), and designs every target tool accepts.
 */
import { designFromHash } from "@musterli/editor-ui/share";
import { HEX_COLOR_PATTERN, registry } from "@musterli/tool-registry";
import { hexToOklch } from "@musterli/engine";
import { describe, expect, it } from "vitest";

import de from "@/messages/de.json";
import en from "@/messages/en.json";
import { ENABLED_LOCALES } from "@/i18n/locales";
import { collectionItemFromSlug, collectionItemSlug, SLUG_PATTERN } from "@/i18n/slugs";
import { designEditorHash, staticDesigns } from "@/lib/seo/motifs";

import { collectionsFor } from ".";
import { colorInfo, lchToHex, relatedItems, type Lch } from "./colors";
import {
  GRADIENT_GROUPS,
  curatedGradients,
  findGradient,
  gradientKeys,
  gradientsByGroup,
  relatedGradients,
} from "./gradients";
import { collectionOgImages, collectionOgKey } from "./og";
import {
  PALETTE_GROUPS,
  curatedPalettes,
  findPalette,
  paletteKeys,
  palettesByGroup,
} from "./palettes";
import {
  collectionMotifs,
  cssGradientCode,
  cssToStyle,
  gradientDesign,
  gradientVariants,
  paletteCode,
  paletteVariants,
  type CollectionVariant,
} from "./variants";

const MESSAGES: Record<string, unknown> = { de, en };
const gradients = curatedGradients();
const palettes = curatedPalettes();

function lookup(locale: string, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      MESSAGES[locale],
    );
}

/** The OKLCH definition survives the trip to hex: no gamut mapping changed it. */
function expectInGamut(lch: Lch, label: string) {
  const back = hexToOklch(lchToHex(lch));
  expect(Math.abs(back.l - lch[0]), `${label} lightness`).toBeLessThan(0.004);
  expect(Math.abs(back.c - lch[1]), `${label} chroma (out of sRGB?)`).toBeLessThan(0.004);
}

describe.each([
  ["gradients", gradients.map((g) => g.id), GRADIENT_GROUPS, "GradientCollection"] as const,
  ["palettes", palettes.map((p) => p.id), PALETTE_GROUPS, "PaletteCollection"] as const,
])("%s collection", (kind, ids, groups, namespace) => {
  it("has 30 to 50 items with unique ids", () => {
    expect(ids.length).toBeGreaterThanOrEqual(30);
    expect(ids.length).toBeLessThanOrEqual(50);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(SLUG_PATTERN);
  });

  it.each(ENABLED_LOCALES)("has unique slugs that round-trip in %s", (locale) => {
    const slugs = ids.map((id) => collectionItemSlug(kind, id, locale));
    for (const slug of slugs) expect(slug).toMatch(SLUG_PATTERN);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const id of ids) {
      expect(collectionItemFromSlug(kind, collectionItemSlug(kind, id, locale), locale)).toBe(id);
    }
  });

  it.each(ENABLED_LOCALES)("has a name and a description for every item in %s", (locale) => {
    for (const id of ids) {
      for (const field of ["name", "description"]) {
        const value = lookup(locale, `${namespace}.items.${id}.${field}`);
        expect(typeof value === "string" && value.length > 2, `${locale} ${id}.${field}`).toBe(
          true,
        );
      }
    }
    for (const group of groups) {
      expect(typeof lookup(locale, `${namespace}.groups.${group}.name`)).toBe("string");
      expect(typeof lookup(locale, `${namespace}.groups.${group}.description`)).toBe("string");
    }
  });

  it("has distinct names per locale", () => {
    for (const locale of ENABLED_LOCALES) {
      const names = ids.map((id) => lookup(locale, `${namespace}.items.${id}.name`));
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("German collection texts", () => {
  const texts = JSON.stringify({
    c: de.Collections,
    g: de.GradientCollection,
    gp: de.GradientPage,
    p: de.PaletteCollection,
    pp: de.PalettePage,
  });

  it("use Swiss spelling and no dashes as punctuation", () => {
    expect(texts).not.toMatch(/ß/);
    expect(texts).not.toMatch(/[–—]/);
    expect(texts).not.toMatch(/ - /);
  });
});

describe("curated gradients", () => {
  it.each(gradients.map((g) => [g.id, g] as const))("%s has valid colours", (id, gradient) => {
    expect(gradient.stops.length).toBeGreaterThanOrEqual(2);
    expect(gradient.stops.length).toBeLessThanOrEqual(4);
    gradient.stops.forEach((lch, i) => expectInGamut(lch, `${id}[${i}]`));
    for (const hex of gradient.colors) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(gradient.colors).size).toBe(gradient.colors.length);
  });

  it("are all different and fill every mood group", () => {
    const keys = gradients.map((g) => g.colors.join());
    expect(new Set(keys).size).toBe(keys.length);
    for (const { items } of gradientsByGroup()) expect(items.length).toBeGreaterThanOrEqual(4);
  });

  it("render CSS through the CSS Gradient tool", () => {
    const glacier = findGradient("glacier");
    if (!glacier) throw new Error("glacier missing");
    const code = cssGradientCode(gradientDesign(glacier));
    expect(code.css).toMatch(
      /^background-color: #[0-9a-f]{6};\nbackground-image: linear-gradient\(180deg,/,
    );
    expect(code.css).toContain("in oklch");
    expect(code.tailwind).toContain("bg-");
    // The inline style keeps the first (sRGB) value, which every browser understands.
    expect(code.style.backgroundImage).toMatch(/^linear-gradient\(180deg, #/);
    const embers = findGradient("embers");
    if (!embers) throw new Error("embers missing");
    expect(cssGradientCode(gradientDesign(embers)).css).toContain("radial-gradient(");
  });

  it("link similar gradients of the same mood first", () => {
    const glacier = findGradient("glacier");
    if (!glacier) throw new Error("glacier missing");
    const related = relatedGradients(glacier);
    expect(related).toHaveLength(6);
    expect(related).not.toContain(glacier);
    expect(related.slice(0, 5).every((g) => g.group === "cool")).toBe(true);
  });
});

describe("curated palettes", () => {
  it.each(palettes.map((p) => [p.id, p] as const))("%s has valid colours", (id, palette) => {
    expect(palette.colors.length).toBeGreaterThanOrEqual(4);
    expect(palette.colors.length).toBeLessThanOrEqual(6);
    palette.lch.forEach((lch, i) => expectInGamut(lch, `${id}[${i}]`));
    for (const hex of palette.colors) expect(hex).toMatch(HEX_COLOR_PATTERN);
    expect(new Set(palette.colors).size).toBe(palette.colors.length);
    expect(palette.colors[palette.accent]).toBeDefined();
  });

  it("are all different and fill every mood group", () => {
    const keys = palettes.map((p) => p.colors.join());
    expect(new Set(keys).size).toBe(keys.length);
    for (const { items } of palettesByGroup()) expect(items.length).toBeGreaterThanOrEqual(4);
  });

  it("export CSS variables and a Tailwind theme", () => {
    const clay = findPalette("clay-oven");
    if (!clay) throw new Error("clay-oven missing");
    const code = paletteCode(clay);
    expect(code.cssVariables).toContain(`--palette-1: ${clay.colors[0]};`);
    expect(code.cssVariables).toContain(`--palette-5: ${clay.colors[4]};`);
    expect(code.tailwind).toMatch(/^@theme \{\n {2}--color-clay-oven-1: oklch\(/);
  });

  it("picks the most colourful entry as accent", () => {
    const print = findPalette("print-shop");
    expect(print?.accent).toBe(2);
  });
});

describe("collection designs", () => {
  const all: [string, CollectionVariant][] = [
    ...gradients.flatMap((g) => {
      const v = gradientVariants(g);
      return [...v.gradient, ...v.colour].map((x): [string, CollectionVariant] => [g.id, x]);
    }),
    ...palettes.flatMap((p) => {
      const v = paletteVariants(p);
      return [...v.gradient, ...v.colour].map((x): [string, CollectionVariant] => [p.id, x]);
    }),
  ];

  it("pass the schema of their tool and open from the share link", () => {
    for (const [id, variant] of all) {
      const tool = registry.get(variant.toolId);
      if (!tool) throw new Error(`${variant.toolId} missing`);
      const parsed = tool.schema.safeParse(variant.design.params);
      expect(parsed.success, `${id} in ${variant.toolId}`).toBe(true);
      const hash = designEditorHash(tool, variant.design);
      expect(hash, `${id} in ${variant.toolId}`).toMatch(/^#d=[\w-]+$/);
      const decoded = designFromHash(hash, registry);
      if (!decoded.ok) throw new Error(`${id} in ${variant.toolId}: ${decoded.error}`);
      expect(decoded.design.toolId).toBe(variant.toolId);
      expect(decoded.design.params).toEqual(variant.design.params);
    }
  });

  it("carry the item's colours", () => {
    const g = findGradient("alpenglow");
    if (!g) throw new Error("alpenglow missing");
    const v = gradientVariants(g);
    for (const variant of v.gradient) {
      expect(variant.design.params.palette).toEqual(g.colors);
    }
    const generator = v.colour.find((x) => x.toolId === "palette-generator");
    expect(generator?.design.params).toMatchObject({
      count: 3,
      color1: g.colors[0],
      color2: g.colors[1],
      color3: g.colors[2],
    });
  });

  it("have static thumbnails that do not clash with preset motifs", () => {
    for (const toolId of ["mesh-gradient", "blurry-gradient", "striped-gradient"]) {
      const tool = registry.get(toolId);
      if (!tool) throw new Error(`${toolId} missing`);
      const motifs = collectionMotifs(toolId);
      expect(motifs.length).toBeGreaterThanOrEqual(toolId === "striped-gradient" ? 30 : 60);
      const presets = new Set(staticDesigns(tool).map((d) => d.id));
      for (const m of motifs) {
        expect(presets.has(m.id)).toBe(false);
      }
    }
  });

  it("have one OG image per item", () => {
    const images = collectionOgImages();
    expect(images).toHaveLength(gradients.length + palettes.length);
    expect(images[0]?.key).toBe(collectionOgKey("gradients", gradients[0]?.id ?? ""));
    expect(images[0]?.svg()).toMatch(/^<svg/);
    expect(images.at(-1)?.svg()).toMatch(/^<svg/);
  });
});

describe("helpers", () => {
  it("turns CSS lines into a React style, first value wins", () => {
    expect(
      cssToStyle("background-color: #fff;\nbackground-image: a;\nbackground-image: b;"),
    ).toEqual({ backgroundColor: "#fff", backgroundImage: "a" });
  });

  it("formats colour values and picks a readable text colour", () => {
    const info = colorInfo("#FFFFFF");
    expect(info.values).toEqual({
      hex: "#ffffff",
      rgb: "rgb(255, 255, 255)",
      oklch: "oklch(100% 0 0)",
    });
    expect(info.text).toBe("#000000");
    expect(colorInfo("#1b263b").text).toBe("#ffffff");
  });

  it("orders related items: same group after the item, then the rest", () => {
    const items = [
      { id: "a", group: "x" },
      { id: "b", group: "y" },
      { id: "c", group: "x" },
      { id: "d", group: "x" },
    ];
    expect(relatedItems(items, items[2] as (typeof items)[number], 3).map((i) => i.id)).toEqual([
      "d",
      "a",
      "b",
    ]);
  });

  it("maps catalogue categories to collections", () => {
    expect(collectionsFor(["gradients", "css-patterns", "backgrounds"])).toEqual(["gradients"]);
    expect(collectionsFor(["colors"])).toEqual(["palettes"]);
    expect(collectionsFor(["patterns"])).toEqual([]);
  });

  it("builds message keys", () => {
    expect(gradientKeys("glacier").name).toBe("GradientCollection.items.glacier.name");
    expect(paletteKeys("lido").description).toBe("PaletteCollection.items.lido.description");
  });
});
