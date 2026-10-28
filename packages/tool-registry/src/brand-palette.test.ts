import { describe, expect, it } from "vitest";
import {
  acceptsBrandPalette,
  applyBrandPalette,
  colorTargets,
  fitPalette,
  mapBrandPalette,
} from "./brand-palette";
import { registry } from "./index";

const BRAND_2 = ["#112233", "#445566"];
const BRAND_5 = ["#0b3d91", "#fc3d21", "#ffffff", "#1f2933", "#f5c518"];
const BRAND_10 = [
  "#000001",
  "#000002",
  "#000003",
  "#000004",
  "#000005",
  "#000006",
  "#000007",
  "#000008",
  "#000009",
  "#00000a",
];

/** Tools whose colours are derived (palette from image): nothing to apply. */
const WITHOUT_COLOR_PARAMS = new Set(["palette-from-image"]);

/** Every hex colour anywhere in the params. */
function hexes(value: unknown): string[] {
  if (typeof value === "string") return /^#[0-9a-f]{3,6}$/i.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(hexes);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(hexes);
  return [];
}

describe("brand palette in every tool", () => {
  const tools = registry.list();

  it("covers the registry", () => {
    expect(tools.length).toBeGreaterThanOrEqual(21);
    const without = tools.filter((t) => !acceptsBrandPalette(t)).map((t) => t.id);
    expect(without).toEqual([...WITHOUT_COLOR_PARAMS]);
  });

  for (const tool of registry.list()) {
    if (WITHOUT_COLOR_PARAMS.has(tool.id)) continue;
    describe(tool.id, () => {
      const starts = [
        ["defaults", tool.defaults],
        ...tool.presets.map((p) => [`preset ${p.id}`, p.params] as const),
      ] as const;
      for (const colors of [BRAND_2, BRAND_5, BRAND_10]) {
        it(`receives a palette of ${colors.length} colours without schema errors`, () => {
          for (const [, params] of starts) {
            const result = applyBrandPalette(tool, params, colors);
            expect(result).not.toBeNull();
            expect(tool.schema.safeParse(result?.params).success).toBe(true);
            // At least one brand colour reached the params, and no colour came from elsewhere
            // except the untouched background.
            const used = hexes(result?.params).map((c) => c.toLowerCase());
            expect(used.some((c) => colors.includes(c))).toBe(true);
            expect(result?.applied.length).toBeGreaterThan(0);
          }
        });
      }

      it("keeps locked colour params", () => {
        const targets = colorTargets(tool);
        const first = targets[0];
        if (!first) throw new Error("no targets");
        const lockKey = first.type === "item-color" ? `${first.list}.0.${first.field}` : first.key;
        const result = applyBrandPalette(tool, tool.defaults, BRAND_5, new Set([lockKey]));
        expect(result).not.toBeNull();
        const before = tool.defaults as Record<string, unknown>;
        const after = result?.params as Record<string, unknown>;
        if (first.type === "item-color") {
          const read = (p: Record<string, unknown>) =>
            (p[first.list] as Record<string, unknown>[])[0]?.[first.field];
          expect(read(after)).toEqual(read(before));
        } else {
          expect(after[first.key]).toEqual(before[first.key]);
        }
        expect(result?.applied).not.toContain(lockKey);
      });
    });
  }

  it("rejects unusable palettes", () => {
    const blob = registry.get("blob");
    if (!blob) throw new Error("blob missing");
    expect(applyBrandPalette(blob, blob.defaults, ["#000000"])).toBeNull();
    expect(applyBrandPalette(blob, blob.defaults, [...BRAND_10, "#ffffff"])).toBeNull();
    expect(applyBrandPalette(blob, blob.defaults, ["#000000", "red"])).toBeNull();
    expect(applyBrandPalette(blob, blob.defaults, ["#000000", "url(x)"])).toBeNull();
  });
});

describe("generic mapping", () => {
  it("gives palette params the palette and keeps the background", () => {
    const blob = registry.get("blob");
    if (!blob) throw new Error("blob missing");
    const result = applyBrandPalette(blob, blob.defaults, BRAND_5);
    expect(result?.params.palette).toEqual(BRAND_5);
    expect(result?.params.background).toBe((blob.defaults as { background: unknown }).background);
    expect(result?.applied).toEqual(["palette"]);
  });

  it("cuts palettes to the schema maximum (noise grain: 3 stops)", () => {
    const tool = registry.get("noise-grain");
    if (!tool) throw new Error("missing");
    const result = applyBrandPalette(tool, tool.defaults, BRAND_5);
    expect(result?.params.palette).toEqual(BRAND_5.slice(0, 3));
    expect(result?.params.color).toBe(BRAND_5[0]);
  });

  it("fills colour fields of list items in order (CSS pattern layers)", () => {
    const tool = registry.get("css-patterns");
    if (!tool) throw new Error("missing");
    const params = {
      ...tool.defaults,
      layers: [
        (tool.defaults as { layers: object[] }).layers[0],
        (tool.defaults as { layers: object[] }).layers[0],
      ],
    };
    const result = applyBrandPalette(tool, params, BRAND_2, new Set(["layers.1.accent"]));
    const layers = result?.params.layers as { color: string; accent: string }[];
    expect(layers[0]).toMatchObject({ color: BRAND_2[0], accent: BRAND_2[1] });
    // Index continues (cycling), the locked accent stays.
    expect(layers[1]?.color).toBe(BRAND_2[0]);
    expect(layers[1]?.accent).toBe((params.layers[1] as { accent: string }).accent);
    expect([...(result?.applied ?? [])].sort()).toEqual(
      ["layers.0.accent", "layers.0.color", "layers.1.color"].sort(),
    );
  });

  it("lets the palette generator show exactly the brand colours", () => {
    const tool = registry.get("palette-generator");
    if (!tool) throw new Error("missing");
    const result = applyBrandPalette(tool, tool.defaults, BRAND_10);
    expect(result?.params.count).toBe(8);
    expect(result?.params.color8).toBe(BRAND_10[7]);
    const three = applyBrandPalette(tool, tool.defaults, BRAND_5.slice(0, 3));
    expect(three?.params.count).toBe(3);
    expect([three?.params.color1, three?.params.color2, three?.params.color3]).toEqual(
      BRAND_5.slice(0, 3),
    );
  });

  it("maps single colour tools to the first brand colour", () => {
    for (const id of ["tints-shades", "tailwind-palette"]) {
      const tool = registry.get(id);
      if (!tool) throw new Error("missing");
      expect(applyBrandPalette(tool, tool.defaults, BRAND_5)?.params.base).toBe(BRAND_5[0]);
    }
  });

  it("does not mutate its input", () => {
    const tool = registry.get("css-patterns");
    if (!tool) throw new Error("missing");
    const before = JSON.stringify(tool.defaults);
    mapBrandPalette(tool, tool.defaults, BRAND_5);
    applyBrandPalette(tool, tool.defaults, BRAND_5);
    expect(JSON.stringify(tool.defaults)).toBe(before);
  });

  it("fits palettes to bounds", () => {
    expect(fitPalette(["#1", "#2"], 3, 10)).toEqual(["#1", "#2", "#1"]);
    expect(fitPalette(["#1", "#2", "#3"], 2, 2)).toEqual(["#1", "#2"]);
  });
});
