import {
  createRenderContext,
  polkaDotsTool,
  seamlessPatternsTool,
  type SeamlessPatternsParams,
} from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { fakeEnv } from "./__fixtures__/raster-fakes";
import { ExportError } from "./errors";
import { exportRasterTile } from "./raster";
import { exportCss, exportSvg, exportTile, supportsTile } from "./text";

const ctx = createRenderContext(1, { width: 600, height: 400 });
const params: SeamlessPatternsParams = seamlessPatternsTool.defaults;

describe("repeat tile exports (seamless tools)", () => {
  it("knows which tools have a tile", () => {
    expect(supportsTile(seamlessPatternsTool)).toBe(true);
    expect(supportsTile(polkaDotsTool)).toBe(false);
    expect(() => exportTile(polkaDotsTool, polkaDotsTool.defaults, ctx)).toThrow(ExportError);
  });

  it("exports the tile built from the same markup as the full SVG", () => {
    const tile = exportTile(seamlessPatternsTool, params, ctx);
    const full = exportSvg(seamlessPatternsTool, params, ctx);
    expect(tile.svg).toMatch(
      new RegExp(`^<svg [^>]*width="${tile.width}" height="${tile.height}"`),
    );
    expect(full).toContain(`<pattern id="`);
    expect(full).toContain(`width="${tile.width}" height="${tile.height}" patternUnits`);
    // Same seed, same tile: exporting twice gives identical output (fresh rng each time).
    expect(exportTile(seamlessPatternsTool, params, ctx)).toEqual(tile);
  });

  it("CSS repeats the tile with its pixel size", () => {
    const tile = exportTile(seamlessPatternsTool, params, ctx);
    const css = exportCss(seamlessPatternsTool, params, ctx);
    expect(css).toMatch(/^background-image: url\("data:image\/svg\+xml,/);
    expect(css).toContain(`background-size: ${tile.width}px ${tile.height}px;`);
    expect(css).toContain("background-repeat: repeat;");
    expect(css).not.toContain("cover");
  });

  it("rasterises the tile at its own size times the scale", async () => {
    const env = fakeEnv();
    const tile = exportTile(seamlessPatternsTool, params, ctx);
    const result = await exportRasterTile(
      seamlessPatternsTool,
      params,
      ctx,
      { format: "png", size: { scale: 2 } },
      env,
    );
    expect(result).toMatchObject({
      width: tile.width * 2,
      height: tile.height * 2,
      filename: "musterli-seamless-patterns-1-tile.png",
    });
    expect(env.loadedSvgs[0]).toContain(`width="${tile.width * 2}" height="${tile.height * 2}"`);
  });
});
