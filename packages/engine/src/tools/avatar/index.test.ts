import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../palette/contrast";
import {
  AVATAR_DARK_INK,
  AVATAR_FONT_STACKS,
  AVATAR_LIGHT_INK,
  autoInk,
  avatarColors,
  avatarHash,
  avatarInitials,
  avatarSvg,
  centeredText,
  compositionPartSvg,
  COMPOSITION_SHAPES,
  customInitials,
  estimateTextWidth,
  fillMarkup,
  fitFontSize,
  identiconCells,
  identiconPath,
  pickColor,
  placeholderSizeLabel,
  placeholderSvg,
  shapeComposition,
  type AvatarOptions,
  type FillOptions,
  type PlaceholderOptions,
} from "./index";

const PALETTE = ["#e07a5f", "#3d405b", "#81b29a", "#f2cc8f"];

const avatar = (patch: Partial<AvatarOptions> = {}): AvatarOptions => ({
  style: "initials",
  text: "AL",
  hash: avatarHash("Ada Lovelace"),
  palette: PALETTE,
  shape: "circle",
  radius: 20,
  fill: "solid",
  gradientAngle: 135,
  pattern: "polka",
  patternSize: 40,
  patternOpacity: 0.3,
  font: "sans",
  fontWeight: 600,
  fontSize: 42,
  ink: null,
  grid: 5,
  cellShape: "square",
  cellGap: 0,
  inset: 0.16,
  background: "transparent",
  width: 256,
  height: 256,
  ...patch,
});

const placeholder = (patch: Partial<PlaceholderOptions> = {}): PlaceholderOptions => ({
  palette: ["#cbd5e1", "#94a3b8"],
  text: "1200 × 630",
  fill: "solid",
  gradientAngle: 90,
  pattern: "grid-lines",
  patternSize: 32,
  patternOpacity: 0.3,
  font: "sans",
  fontWeight: 600,
  fontSize: 12,
  ink: null,
  cross: false,
  border: 0,
  width: 1200,
  height: 630,
  ...patch,
});

describe("avatarHash", () => {
  it("is a stable uint32 that ignores case, outer spaces and normalisation", () => {
    const h = avatarHash("Ada Lovelace");
    expect(h).toBe(avatarHash("  ada lovelace "));
    expect(h).toBe(avatarHash("ADA LOVELACE"));
    // "é" composed vs. "e" + combining acute.
    expect(avatarHash("Zoé")).toBe(avatarHash("Zoé"));
    expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
    expect(avatarHash("Ada Lovelace")).not.toBe(avatarHash("Alan Turing"));
  });
});

describe("avatarInitials", () => {
  it("takes the first and last word for two letters", () => {
    expect(avatarInitials("Ada Lovelace", 2)).toBe("AL");
    expect(avatarInitials("anna maria muster", 2)).toBe("AM");
    expect(avatarInitials("anna maria muster", 3)).toBe("AMM");
    expect(avatarInitials("Ada Lovelace", 1)).toBe("A");
  });

  it("fills up from the last word and splits on separators", () => {
    expect(avatarInitials("Ada", 2)).toBe("AD");
    expect(avatarInitials("ada", 3)).toBe("ADA");
    expect(avatarInitials("jean-luc.picard@example.com", 2)).toBe("JP");
    expect(avatarInitials("@handle", 2)).toBe("HA");
    expect(avatarInitials("jean-luc picard", 3)).toBe("JLP");
  });

  it("skips symbols, keeps digits and other scripts, caps at three code points", () => {
    expect(avatarInitials("(Max) *Muster*", 2)).toBe("MM");
    expect(avatarInitials("Team 42", 2)).toBe("T4");
    expect(avatarInitials("Élodie Ñúñez", 2)).toBe("ÉÑ");
    expect(avatarInitials("山田 太郎", 2)).toBe("山太");
    expect(avatarInitials("ßtraße", 1)).toBe("S");
    expect(avatarInitials("a b c d e", 9)).toBe("ABE");
  });

  it("returns ? without letters or digits", () => {
    expect(avatarInitials("", 2)).toBe("?");
    expect(avatarInitials("  --  ", 2)).toBe("?");
  });
});

describe("customInitials", () => {
  it("keeps case and cuts by code points", () => {
    expect(customInitials(" xY ")).toBe("xY");
    expect(customInitials("ABCD")).toBe("ABC");
    expect(customInitials("😀😀😀😀")).toBe("😀😀😀");
  });
});

describe("text measuring", () => {
  it("estimates wide characters and spaces", () => {
    expect(estimateTextWidth("AB", "sans")).toBeCloseTo(1.24);
    expect(estimateTextWidth("AB", "mono")).toBeCloseTo(1.2);
    expect(estimateTextWidth("山", "sans")).toBe(1);
    expect(estimateTextWidth("😀", "sans")).toBe(1);
    expect(estimateTextWidth("a b", "sans")).toBeCloseTo(1.54);
  });

  it("fits the font size into the box", () => {
    expect(fitFontSize("AB", "sans", 50, 1000, 1000)).toBe(50);
    expect(fitFontSize("ABCDEFGHIJ", "sans", 100, 310, 1000)).toBeCloseTo(50);
    expect(fitFontSize("A", "sans", 100, 1000, 40)).toBe(40);
    expect(fitFontSize("", "sans", 30, 10, 10)).toBe(10);
  });

  it("escapes user text and uses a system font stack", () => {
    const svg = centeredText({
      text: `<script>&"'`,
      x: 10,
      y: 10,
      size: 20,
      font: "serif",
      weight: 700,
      color: "#000000",
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&amp;&quot;&#39;");
    expect(svg).toContain(`font-family="${AVATAR_FONT_STACKS.serif}"`);
    expect(svg).toContain('y="17"');
    expect(
      centeredText({ text: "", x: 0, y: 0, size: 1, font: "sans", weight: 400, color: "#000" }),
    ).toBe("");
  });

  it("never names a downloadable font", () => {
    for (const stack of Object.values(AVATAR_FONT_STACKS)) {
      expect(stack).toMatch(/(sans-serif|serif|monospace)$/);
      expect(stack).not.toMatch(/url\(|@font-face/);
    }
  });
});

describe("colours", () => {
  it("picks a palette colour by hash", () => {
    expect(pickColor(PALETTE, 0)).toBe(PALETTE[0]);
    expect(pickColor(PALETTE, 6)).toBe(PALETTE[2]);
    expect(() => pickColor([], 1)).toThrow(RangeError);
  });

  it("chooses the readable ink", () => {
    expect(autoInk("#111111")).toBe(AVATAR_LIGHT_INK);
    expect(autoInk("#fafafa")).toBe(AVATAR_DARK_INK);
    for (const c of PALETTE) expect(contrastRatio(c, autoInk(c))).toBeGreaterThan(3);
  });

  it("derives base, neighbours and ink", () => {
    expect(avatarColors(PALETTE, 3, null)).toEqual({
      base: PALETTE[3],
      second: PALETTE[0],
      third: PALETTE[1],
      ink: autoInk(PALETTE[3] as string),
    });
    expect(avatarColors(PALETTE, 3, "#123456").ink).toBe("#123456");
  });
});

describe("fillMarkup", () => {
  const fill = (patch: Partial<FillOptions>): FillOptions => ({
    fill: "solid",
    base: "#336699",
    second: "#ffcc00",
    ink: "#ffffff",
    gradientAngle: 90,
    pattern: "polka",
    patternSize: 20,
    patternOpacity: 0.5,
    ...patch,
  });

  it("draws a solid rect", () => {
    expect(fillMarkup(fill({}), 1, 2, 30, 40)).toEqual({
      defs: "",
      body: '<rect x="1" y="2" width="30" height="40" fill="#336699"/>',
    });
  });

  it("draws a CSS-angled gradient from base to second", () => {
    const g = fillMarkup(fill({ fill: "gradient" }), 0, 0, 100, 50);
    expect(g.defs).toContain('x1="0" y1="25" x2="100" y2="25"');
    expect(g.defs).toContain('stop-color="#336699"');
    expect(g.defs).toContain('stop-color="#ffcc00"');
    expect(g.body).toMatch(/fill="url\(#ag[a-z0-9]+\)"/);
  });

  it("nests a library pattern at the box position", () => {
    const p = fillMarkup(fill({ fill: "pattern" }), 10, 20, 100, 100);
    expect(p.body.startsWith('<svg x="10" y="20" ')).toBe(true);
    expect(p.body).toContain('fill="#336699"');
    expect(() => fillMarkup(fill({ fill: "pattern", pattern: "nope" }), 0, 0, 10, 10)).toThrow();
  });
});

describe("identicons", () => {
  it("are mirrored, deterministic and never empty", () => {
    for (const grid of [4, 5, 7, 9]) {
      for (let h = 0; h < 40; h++) {
        const cells = identiconCells(h * 2654435761, grid);
        expect(cells).toHaveLength(grid * grid);
        expect(cells.some(Boolean)).toBe(true);
        for (let r = 0; r < grid; r++) {
          for (let c = 0; c < grid; c++) {
            expect(cells[r * grid + c]).toBe(cells[r * grid + grid - 1 - c]);
          }
        }
      }
    }
    expect(identiconCells(42, 5)).toEqual(identiconCells(42, 5));
    expect(identiconCells(42, 5)).not.toEqual(identiconCells(43, 5));
  });

  it("clamps the grid", () => {
    expect(identiconCells(1, 2)).toHaveLength(16);
    expect(identiconCells(1, 20)).toHaveLength(81);
  });

  it("writes one sub-path per cell", () => {
    const cells = [true, false, true, false];
    for (const shape of ["square", "dot", "rounded"] as const) {
      const d = identiconPath(cells, 2, 0, 0, 100, shape, 0.1);
      expect(d.match(/M/g)).toHaveLength(2);
      expect(d.endsWith("z")).toBe(true);
    }
    expect(identiconPath([false], 1, 0, 0, 10, "square", 0)).toBe("");
  });
});

describe("shapeComposition", () => {
  it("has three nested sizes inside the box, deterministic per hash", () => {
    const parts = shapeComposition(7);
    expect(parts.map((p) => p.size)).toEqual([0.9, 0.55, 0.3]);
    expect(new Set(parts.map((p) => p.slot)).size).toBe(3);
    for (const p of parts) {
      expect(p.cx - p.size / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(p.cx + p.size / 2).toBeLessThanOrEqual(1 + 1e-9);
      expect(p.cy - p.size / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(p.cy + p.size / 2).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(shapeComposition(7)).toEqual(parts);
    expect(shapeComposition(8)).not.toEqual(parts);
  });

  it("draws every shape kind", () => {
    for (const shape of COMPOSITION_SHAPES) {
      const svg = compositionPartSvg(
        { shape, cx: 0.5, cy: 0.5, size: 0.5, turn: 1, slot: 0 },
        0,
        0,
        100,
        "#ff0000",
      );
      expect(svg).toMatch(/^<(circle|path|rect) /);
      expect(svg).toContain("#ff0000");
    }
  });
});

describe("avatarSvg", () => {
  it("clips the motif to the shape over the shorter edge", () => {
    const svg = avatarSvg(avatar({ width: 300, height: 200 }));
    expect(svg).toContain('<circle cx="150" cy="100" r="100"/>');
    expect(svg).toContain(">AL</text>");
    expect(svg).not.toContain("<rect width=");
  });

  it("draws the outer background, rounded and square shapes", () => {
    expect(avatarSvg(avatar({ background: "#ffffff" }))).toContain(
      '<rect width="256" height="256" fill="#ffffff"/>',
    );
    expect(avatarSvg(avatar({ shape: "rounded", radius: 25 }))).toContain('rx="64"');
    expect(avatarSvg(avatar({ shape: "square" }))).not.toContain("rx=");
  });

  it("renders identicons and compositions without text", () => {
    const id = avatarSvg(avatar({ style: "identicon" }));
    expect(id).not.toContain("<text");
    expect(id).toMatch(/<path d="M[^"]+" fill="#(111827|ffffff)"\/>/);
    const shapes = avatarSvg(avatar({ style: "shapes" }));
    expect(shapes).not.toContain("<text");
  });

  it("takes the base colour from the hash and keeps the text inside", () => {
    const svg = avatarSvg(avatar({ text: "WWW", fontSize: 80, hash: 2 }));
    expect(svg).toContain(`fill="${PALETTE[2]}"`);
    const size = Number(/font-size="([\d.]+)"/.exec(svg)?.[1]);
    expect(size * estimateTextWidth("WWW", "sans")).toBeLessThanOrEqual(0.78 * 256 + 0.01);
  });

  it("is deterministic and supports every fill", () => {
    for (const fill of ["solid", "gradient", "pattern"] as const) {
      expect(avatarSvg(avatar({ fill }))).toBe(avatarSvg(avatar({ fill })));
    }
  });
});

describe("placeholderSvg", () => {
  it("labels the size and fits the text into the width", () => {
    expect(placeholderSizeLabel(1200.4, 630)).toBe("1200 × 630");
    const svg = placeholderSvg(placeholder({ width: 160, height: 600, text: "160 × 600" }));
    const size = Number(/font-size="([\d.]+)"/.exec(svg)?.[1]);
    expect(size * estimateTextWidth("160 × 600", "sans")).toBeLessThanOrEqual(0.86 * 160 + 0.01);
    expect(svg).toContain(">160 × 600</text>");
  });

  it("draws cross, border and a pill behind the label", () => {
    const svg = placeholderSvg(placeholder({ cross: true, border: 8 }));
    expect(svg).toContain('d="M0 0L1200 630M1200 0L0 630"');
    expect(svg).toContain('stroke-width="8"');
    expect(svg).toMatch(/rx="[\d.]+" fill="#cbd5e1"/);
  });

  it("omits the label when empty and escapes custom text", () => {
    expect(placeholderSvg(placeholder({ text: "" }))).not.toContain("<text");
    expect(placeholderSvg(placeholder({ text: "<b>Hi</b>" }))).toContain("&lt;b&gt;Hi&lt;/b&gt;");
  });

  it("stays small at extreme sizes", () => {
    for (const fill of ["solid", "gradient", "pattern"] as const) {
      const svg = placeholderSvg(
        placeholder({ fill, width: 8192, height: 16, cross: true, border: 32 }),
      );
      expect(svg.length).toBeLessThan(20_000);
    }
  });
});
