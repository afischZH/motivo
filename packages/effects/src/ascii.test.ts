import { describe, expect, it } from "vitest";
import {
  ASCII_CELLS_MAX,
  ASCII_GRID_MAX_LENGTH,
  ASCII_GRID_PATTERN,
  ASCII_RAMPS,
  NEUTRAL_TONE,
  asciiArtHtml,
  asciiArtSvg,
  asciiArtText,
  asciiGridSize,
  asciiRows,
  buildAsciiGrid,
  createPixelBuffer,
  decodeAsciiGrid,
  demoPhoto,
  encodeAsciiGrid,
  rampChars,
  type AsciiGrid,
  type AsciiStyle,
} from "./index";

const style: AsciiStyle = {
  ...NEUTRAL_TONE,
  mode: "ascii",
  ramp: ASCII_RAMPS.standard,
  invert: false,
  colorMode: "single",
  ink: "#111111",
  background: "#ffffff",
  dotMode: "size",
  dotShape: "round",
  dotSize: 0.9,
};

/** A grid with a horizontal ramp from black (left) to white (right). */
function ramp(cols: number, rows: number): AsciiGrid {
  const data = new Uint8Array(cols * rows * 4);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = Math.round((x / Math.max(1, cols - 1)) * 255);
      data.set([v, v, v, v], (y * cols + x) * 4);
    }
  }
  return { cols, rows, data };
}

describe("asciiGridSize", () => {
  it("derives rows from the picture and the cell aspect", () => {
    expect(asciiGridSize(1500, 1000, 100, 0.5, "ascii")).toEqual({ cols: 100, rows: 33 });
    expect(asciiGridSize(1000, 1000, 50, 1, "dots")).toEqual({ cols: 50, rows: 50 });
    expect(asciiGridSize(1500, 1000, 60, 0.5, "braille")).toEqual({ cols: 120, rows: 80 });
  });

  it("stays within the cell budget for any input", () => {
    for (const mode of ["ascii", "dots", "braille"] as const) {
      for (const [w, h] of [
        [1000, 1000],
        [16, 8192],
        [8192, 16],
      ] as const) {
        const { cols, rows } = asciiGridSize(w, h, 240, 1, mode);
        expect(cols * rows).toBeLessThanOrEqual(ASCII_CELLS_MAX);
        expect(cols).toBeGreaterThanOrEqual(1);
        expect(rows).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("buildAsciiGrid", () => {
  it("averages each cell and composites transparency onto white", () => {
    const img = createPixelBuffer(4, 2);
    for (let i = 0; i < 8; i++) {
      const x = i % 4;
      img.data.set(x < 2 ? [0, 0, 0, 255] : [255, 0, 0, 0], i * 4);
    }
    const grid = buildAsciiGrid(img, 2, 1);
    expect(Array.from(grid.data)).toEqual([0, 0, 0, 0, 255, 255, 255, 255]);
  });

  it("round-trips through the string encoding", () => {
    const grid = buildAsciiGrid(demoPhoto(90, 60), 30, 12);
    const text = encodeAsciiGrid(grid);
    expect(text).toMatch(ASCII_GRID_PATTERN);
    const back = decodeAsciiGrid(text);
    expect(back?.cols).toBe(30);
    expect(back?.rows).toBe(12);
    expect(Array.from(back?.data ?? [])).toEqual(Array.from(grid.data));
  });

  it("rejects malformed encodings", () => {
    expect(decodeAsciiGrid("")).toBeNull();
    expect(decodeAsciiGrid("v1:2x2:AAAA")).toBeNull();
    expect(decodeAsciiGrid("v1:0x2:")).toBeNull();
    expect(decodeAsciiGrid("v2:1x1:AAAAAA==")).toBeNull();
    expect(decodeAsciiGrid("v1:1x1:AAAAAA==")).not.toBeNull();
    expect(decodeAsciiGrid("v1:999x999:AAAAAA==")).toBeNull();
  });

  it("fits the largest grid into the documented string length", () => {
    const full: AsciiGrid = { cols: 200, rows: 160, data: new Uint8Array(200 * 160 * 4) };
    expect(encodeAsciiGrid(full).length).toBeLessThanOrEqual(ASCII_GRID_MAX_LENGTH);
  });
});

describe("rows and ramps", () => {
  it("picks empty glyphs for light cells and dense ones for dark cells", () => {
    const rows = asciiRows(ramp(10, 1), style);
    expect(rows[0]?.map((r) => r.text).join("")).toBe("@%#*+=-:. ");
    const inverted = asciiRows(ramp(10, 1), { ...style, invert: true });
    expect(inverted[0]?.map((r) => r.text).join("")).toBe(" .:-=+*#%@");
  });

  it("filters control characters out of custom ramps", () => {
    expect(rampChars("a\nb\tc")).toEqual(["a", "b", "c"]);
    expect(rampChars("\n")).toEqual(Array.from(ASCII_RAMPS.standard));
    expect(rampChars("x".repeat(100))).toHaveLength(64);
    expect(rampChars(" ░▒")).toEqual([" ", "░", "▒"]);
  });

  it("groups photo colours into runs and lets blanks join them", () => {
    const grid: AsciiGrid = {
      cols: 3,
      rows: 1,
      data: new Uint8Array([0, 255, 0, 0, 255, 0, 0, 255, 0, 255, 0, 0]),
    };
    const rows = asciiRows(grid, { ...style, colorMode: "photo" });
    expect(rows[0]).toEqual([{ color: "#f00", text: "@ @" }]);
    const mixed: AsciiGrid = {
      cols: 2,
      rows: 1,
      data: new Uint8Array([0, 255, 0, 0, 0, 0, 0, 255]),
    };
    expect(asciiRows(mixed, { ...style, colorMode: "photo" })[0]).toEqual([
      { color: "#f00", text: "@" },
      { color: "#00f", text: "@" },
    ]);
  });

  it("draws braille with 2 x 4 dots per character", () => {
    const dark: AsciiGrid = { cols: 4, rows: 4, data: new Uint8Array(64) };
    const rows = asciiRows(dark, { ...style, mode: "braille" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.map((r) => r.text).join("")).toBe("⣿⣿");
    const light: AsciiGrid = { cols: 2, rows: 4, data: new Uint8Array(32).fill(255) };
    expect(asciiRows(light, { ...style, mode: "braille" })[0]?.[0]?.text).toBe("⠀");
  });
});

describe("outputs", () => {
  const grid = buildAsciiGrid(demoPhoto(300, 200), 60, 22);

  it("writes compact, escaped SVG text rows stretched to the width", () => {
    const svg = asciiArtSvg(grid, { ...style, ramp: "<&>" }, 600, 400);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="600"')).toBe(true);
    expect(svg.match(/<text /g)).toHaveLength(22);
    expect(svg).toContain('textLength="600"');
    expect(svg).toContain("monospace");
    expect(svg).not.toMatch(/<[^/a-z!]/);
    expect(svg).toContain("&lt;");
  });

  it("draws dots as one path per level, round or square", () => {
    const round = asciiArtSvg(grid, { ...style, mode: "dots" }, 600, 400);
    expect(round).toContain('stroke-linecap="round"');
    expect(round).toMatch(/d="M[\d.]+ [\d.]+h0/);
    const square = asciiArtSvg(
      grid,
      { ...style, mode: "dots", dotShape: "square", dotMode: "lit" },
      600,
      400,
    );
    expect(square).toContain("fill-opacity=");
    expect(square).not.toContain("stroke");
  });

  it("keeps the SVG under 1 MB at the cell budget, also in colour", () => {
    const { cols, rows } = asciiGridSize(1500, 1000, 240, 0.55, "ascii");
    const big = buildAsciiGrid(demoPhoto(cols * 2, rows * 2), cols, rows);
    for (const s of [
      { ...style, colorMode: "photo" as const },
      { ...style, mode: "dots" as const, colorMode: "photo" as const },
      { ...style, mode: "dots" as const, dotShape: "square" as const },
    ]) {
      expect(asciiArtSvg(big, s, 1500, 1000).length).toBeLessThan(1_000_000);
    }
  });

  it("exports text lines and an HTML pre", () => {
    const text = asciiArtText(grid, style);
    expect(text.split("\n")).toHaveLength(22);
    expect(text).not.toMatch(/ +$/m);
    const html = asciiArtHtml(grid, { ...style, colorMode: "photo" }, 600, 400);
    expect(html.startsWith("<pre style=")).toBe(true);
    expect(html).toContain('<span style="color:#');
    expect(html.trimEnd().endsWith("</pre>")).toBe(true);
    // Dots fall back to characters in text exports.
    expect(asciiArtText(grid, { ...style, mode: "dots" })).toBe(text);
  });
});
