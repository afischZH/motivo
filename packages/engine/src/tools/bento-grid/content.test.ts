import { describe, expect, it } from "vitest";
import { escapeXml } from "../../svg";
import { shapePath } from "../../shapes";
import {
  BENTO_TYPE_SCALE,
  cssUrl,
  hasExtras,
  hasUserContent,
  placeholderComment,
  tileContentLayout,
  tileContentSvg,
  typeToken,
  wrapText,
} from "./content";
import { bentoHtml, bentoSvg, bentoTailwind, paintTiles, type BentoCodeOptions } from "./index";
import { bentoLayout } from "./layout";
import { createRng } from "../../rng";

const HOSTILE = "</text><script>alert(1)</script>\"'&";

describe("escapeXml", () => {
  it("escapes markup characters in content and attributes", () => {
    expect(escapeXml(HOSTILE)).toBe(
      "&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;",
    );
  });

  it("drops characters XML forbids, keeps tabs, newlines and emoji", () => {
    expect(escapeXml("a\u0000b\u0008c\u001fd￿")).toBe("abcd");
    expect(escapeXml("x\ud800y")).toBe("xy");
    expect(escapeXml("a\tb\nc 🍱")).toBe("a\tb\nc 🍱");
  });
});

describe("wrapText", () => {
  it("breaks at words within the width", () => {
    // 100 px at 10 px: 17 characters per line.
    expect(wrapText("Hello world, this is a bento tile", 100, 10, 3)).toEqual([
      "Hello world, this",
      "is a bento tile",
    ]);
  });

  it("ends overflowing text with an ellipsis", () => {
    const lines = wrapText("one two three four five six seven eight", 60, 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith("…")).toBe(true);
  });

  it("cuts words longer than a line and collapses whitespace", () => {
    expect(wrapText("  abcdefghijklmnop  ", 57, 10, 3)).toEqual(["abcdefghij", "klmnop"]);
    expect(wrapText("a\n\n b", 100, 10, 2)).toEqual(["a b"]);
    expect(wrapText("", 100, 10, 2)).toEqual([]);
  });
});

describe("type tokens", () => {
  it("picks the largest token at or below the size", () => {
    expect(typeToken(5)).toBe(12);
    expect(typeToken(23)).toBe(20);
    expect(typeToken(100)).toBe(48);
    expect(BENTO_TYPE_SCALE).toEqual([12, 14, 16, 20, 24, 32, 48]);
  });
});

describe("tile content", () => {
  const rect = { x: 10, y: 20, width: 300, height: 200 };
  const icon = shapePath("heart");

  it("places icon top left, text at the bottom and the graphic between", () => {
    const l = tileContentLayout(rect, {
      title: "Title",
      subtitle: "Sub",
      icon,
      graphic: {
        href: "data:image/png;base64,AA==",
        codeUrl: "g.png",
        position: "center",
        size: 100,
      },
    });
    expect(l.icon).toMatchObject({ x: 10 + l.pad, y: 20 + l.pad });
    expect(l.lines.map((x) => x.text)).toEqual(["Title", "Sub"]);
    const g = l.graphic ?? { y: 0, height: 0 };
    const i = l.icon ?? { y: 0, height: 0 };
    expect(g.y).toBeGreaterThan(i.y + i.height);
    expect(g.y + g.height).toBeLessThan(l.textTop ?? 0);
  });

  it("drops subtitle lines before title lines when space runs out", () => {
    const l = tileContentLayout(
      { x: 0, y: 0, width: 200, height: 40 },
      {
        title: "A title",
        subtitle: "A subtitle that is long enough for lines",
      },
    );
    expect(l.lines.every((x) => x.title)).toBe(true);
  });

  it("escapes hostile text and clips to the tile", () => {
    const out = tileContentSvg(rect, 12, { title: HOSTILE, subtitle: HOSTILE }, "#000000");
    expect(out.body).not.toMatch(/<script|<\/text><script/);
    expect(out.body).toContain("&lt;/text&gt;");
    expect(out.body.match(/<text /g)?.length).toBe(out.body.match(/<\/text>/g)?.length);
    expect(out.defs).toMatch(
      /^<clipPath id="bc[0-9a-z]+"><rect x="10" y="20" width="300" height="200" rx="12"\/><\/clipPath>$/,
    );
  });

  it("puts white text and a scrim over a background picture", () => {
    const out = tileContentSvg(
      rect,
      0,
      {
        title: "Hi",
        background: { href: "data:image/png;base64,AA==", codeUrl: "b.png" },
      },
      "#111111",
    );
    expect(out.body).toContain('fill="#ffffff"');
    expect(out.defs).toContain("<linearGradient");
    expect(out.body).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it("knows when there is content", () => {
    expect(hasUserContent({ title: "  " })).toBe(false);
    expect(hasUserContent({ icon })).toBe(true);
    expect(hasExtras({ contents: [undefined, { title: "" }] })).toBe(false);
    expect(hasExtras({ backgroundImage: { href: "x", codeUrl: "y" } })).toBe(true);
  });

  it("keeps URLs inside CSS and comments harmless", () => {
    expect(cssUrl("a'b\"c<d>\n")).toBe("url('abcd')");
    expect(placeholderComment("Tile 1", { href: "data:x", codeUrl: "x--y.png" })).toBe(
      "<!-- Tile 1: replace xy.png with your own image. -->",
    );
    expect(placeholderComment("Tile 1", { href: "data:x", codeUrl: "data:x" })).toBeNull();
  });
});

describe("grid with content", () => {
  const o: BentoCodeOptions = {
    width: 1200,
    height: 800,
    columns: 4,
    rows: 3,
    gap: 16,
    padding: 24,
    radius: 24,
    background: "#ffffff",
    breakpointColumns: 2,
    breakpoint: 768,
  };
  const tiles = paintTiles(
    createRng(1),
    bentoLayout(createRng(7), { columns: 4, rows: 3, tiles: 6, minSpan: 1, maxSpan: 3 }).tiles,
    ["#e0e7ff", "#fde68a"],
    "palette-order",
    "mixed",
  );

  it("is byte-identical without extras", () => {
    expect(bentoSvg(tiles, o, { contents: [] })).toBe(bentoSvg(tiles, o));
    expect(bentoHtml(tiles, o, { contents: [] })).toBe(bentoHtml(tiles, o));
    expect(bentoTailwind(tiles, o, { contents: [] })).toBe(bentoTailwind(tiles, o));
  });

  it("writes content as escaped HTML, never the picture data", () => {
    const extras = {
      contents: [
        {
          title: HOSTILE,
          icon: shapePath("star"),
          graphic: {
            href: "data:image/png;base64,AA==",
            codeUrl: "tile-1-graphic.png",
            position: "top" as const,
            size: 60,
          },
        },
      ],
      backgroundImage: { href: "data:image/jpeg;base64,AA==", codeUrl: "bento-background.jpg" },
    };
    for (const code of [bentoHtml(tiles, o, extras), bentoTailwind(tiles, o, extras)]) {
      expect(code).not.toContain("data:image");
      expect(code).not.toMatch(/<script/);
      expect(code).toContain("<h3");
      expect(code).toContain(
        "&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;</h3>",
      );
      expect(code).toContain('src="tile-1-graphic.png"');
      expect(code).toContain("bento-background.jpg");
    }
    const svg = bentoSvg(tiles, o, extras);
    expect(svg).toContain('xlink:href="data:image/jpeg;base64,AA=="');
    expect(svg).toContain('preserveAspectRatio="xMidYMin meet"');
  });
});
