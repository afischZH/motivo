import { describe, expect, it } from "vitest";
import { estimateTextWidth } from "../avatar";
import { fitTitle, inkForColors, ogImage, wrapOgText, type OgImageOptions } from "./index";

const base: OgImageOptions = {
  width: 1200,
  height: 630,
  backdrop:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#000"/></svg>',
  layout: "classic",
  panel: "none",
  panelColor: "#000000",
  panelOpacity: 0.6,
  eyebrow: "New",
  title: "Ship beautiful websites in half the time",
  subtitle: "Patterns, gradients and code",
  site: "example.com",
  logo: null,
  font: "sans",
  titleWeight: 800,
  titleSize: 10,
  ink: "#ffffff",
  accent: "#facc15",
  padding: 8,
};

describe("og image text", () => {
  it("wraps words greedily within the width", () => {
    const { lines, truncated } = wrapOgText("one two three four five six", "sans", 20, 140, 5);
    expect(truncated).toBe(false);
    expect(lines.join(" ")).toBe("one two three four five six");
    for (const line of lines) expect(estimateTextWidth(line, "sans") * 20).toBeLessThanOrEqual(140);
  });

  it("breaks words longer than a line and cuts with an ellipsis", () => {
    const long = wrapOgText("Supercalifragilisticexpialidocious", "sans", 20, 100, 6);
    expect(long.lines.length).toBeGreaterThan(1);
    expect(long.lines.join("")).toBe("Supercalifragilisticexpialidocious");
    const cut = wrapOgText("a b c d e f g h i j k l m n o p", "sans", 20, 60, 2);
    expect(cut.truncated).toBe(true);
    expect(cut.lines).toHaveLength(2);
    expect(cut.lines[1]?.endsWith("…")).toBe(true);
    expect(wrapOgText("   ", "sans", 20, 100, 2)).toEqual({ lines: [], truncated: false });
  });

  it("shrinks a title before cutting it", () => {
    const text = "A fairly long title that needs a little more room than one line";
    const fitted = fitTitle(text, "sans", 80, 900, 2);
    expect(fitted.size).toBeLessThan(80);
    expect(fitted.size).toBeGreaterThanOrEqual(80 * 0.6 - 1e-9);
    expect(fitted.truncated).toBe(false);
    const short = fitTitle("Short", "sans", 80, 900, 2);
    expect(short.size).toBe(80);
  });

  it("picks the text colour with the best worst-case contrast", () => {
    expect(inkForColors(["#000000", "#1e1b4b"])).toBe("#ffffff");
    expect(inkForColors(["#ffffff", "#fef3c7"])).toBe("#111827");
  });
});

describe("og image", () => {
  it("escapes all user text and the logo address", () => {
    const { svg } = ogImage({
      ...base,
      title: `<b>"Hi" & 'bye'</b>`,
      eyebrow: "<x>",
      site: "a&b",
      logo: { href: 'data:image/png;base64,AA"onload="x', aspect: 2 },
    });
    expect(svg).not.toMatch(/<b>|<x>|"onload/);
    expect(svg).toContain("&lt;b&gt;&quot;Hi&quot; &amp; &#39;bye&#39;&lt;/b&gt;");
    expect(svg).toContain("a&amp;b");
  });

  it("nests the backdrop and leaves empty fields out", () => {
    const { svg } = ogImage({ ...base, eyebrow: "", subtitle: "", site: "" });
    expect(svg).toContain('<svg x="0" y="0" xmlns');
    expect(svg.match(/<text /g)).toHaveLength(2);
    expect(svg).not.toContain("<rect x=");
  });

  it("draws panels: an opaque split panel, a fading scrim and a card", () => {
    expect(ogImage({ ...base, layout: "split" }).svg).toContain('<rect width="696" height="630"');
    expect(ogImage({ ...base, panel: "scrim" }).svg).toContain("<linearGradient");
    expect(ogImage({ ...base, layout: "centered", panel: "scrim" }).svg).toContain(
      "<radialGradient",
    );
    expect(ogImage({ ...base, panel: "card" }).svg).toMatch(/fill-opacity="0.6"/);
  });

  it("reports cut text", () => {
    expect(ogImage(base).truncated).toBe(false);
    expect(ogImage({ ...base, title: "word ".repeat(40), titleSize: 16 }).truncated).toBe(true);
  });
});
