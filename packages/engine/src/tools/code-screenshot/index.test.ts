import { describe, expect, it } from "vitest";
import {
  CODE_LANGUAGES,
  CODE_MAX_LINES,
  CODE_THEMES,
  codeLayout,
  codeLines,
  codeScreenshotSvg,
  parseLineRanges,
  tokenLines,
  tokenize,
  type CodeScreenshotOptions,
  type TokenKind,
} from "./index";

const kinds = (code: string, language: Parameters<typeof tokenize>[1]) =>
  tokenize(code, language)
    .filter((t) => t.kind !== "plain")
    .map((t) => [t.kind, t.text] as [TokenKind, string]);

describe("highlighter", () => {
  it("keeps every character of the input", () => {
    const code = 'const a = "x"; // hi\n<div class="b">\n  def f(): return 1\n';
    for (const language of CODE_LANGUAGES) {
      expect(
        tokenize(code, language)
          .map((t) => t.text)
          .join(""),
      ).toBe(code);
    }
  });

  it("colours JavaScript", () => {
    expect(kinds('const x = fn("a", 42); // done', "javascript")).toEqual([
      ["keyword", "const"],
      ["punctuation", "="],
      ["function", "fn"],
      ["punctuation", "("],
      ["string", '"a"'],
      ["punctuation", ","],
      ["number", "42"],
      ["punctuation", ");"],
      ["comment", "// done"],
    ]);
  });

  it("colours CSS, HTML, Python and JSON", () => {
    expect(kinds(".card { color: #fff; }", "css")).toContainEqual(["attribute", "color"]);
    expect(kinds(".card { color: #fff; }", "css")).toContainEqual(["number", "#fff"]);
    expect(kinds('<a href="/x">Hi</a>', "html")).toEqual([
      ["tag", "<a"],
      ["attribute", "href"],
      ["punctuation", "="],
      ["string", '"/x"'],
      ["tag", ">"],
      ["tag", "</a"],
      ["tag", ">"],
    ]);
    expect(kinds("def f(): # c", "python")).toEqual([
      ["keyword", "def"],
      ["function", "f"],
      ["punctuation", "():"],
      ["comment", "# c"],
    ]);
    expect(kinds('{"a": true}', "json")).toEqual([
      ["punctuation", "{"],
      ["attribute", '"a"'],
      ["punctuation", ":"],
      ["keyword", "true"],
      ["punctuation", "}"],
    ]);
  });

  it("splits multi-line tokens at line breaks", () => {
    const lines = tokenLines(tokenize("/* a\nb */ x", "javascript"));
    expect(lines).toHaveLength(2);
    expect(lines[1]?.[0]).toEqual({ kind: "comment", text: "b */" });
  });
});

describe("code lines", () => {
  it("expands tabs, drops trailing blank lines and cuts long code", () => {
    expect(codeLines("\ta\n\n\n").lines).toEqual(["  a"]);
    const long = codeLines(Array.from({ length: 100 }, (_, i) => `l${i}`).join("\n"));
    expect(long.cut).toBe(true);
    expect(long.lines).toHaveLength(CODE_MAX_LINES + 1);
    expect(long.lines.at(-1)).toBe("…");
  });

  it("parses line ranges", () => {
    expect([...parseLineRanges("2, 4-6 9-8 x 20", 10)]).toEqual([2, 4, 5, 6, 8, 9]);
  });
});

describe("code screenshot svg", () => {
  const base: CodeScreenshotOptions = {
    width: 1600,
    height: 1000,
    backdrop: "",
    code: 'const a = "<b>&";',
    language: "javascript",
    theme: "midnight",
    frame: "window",
    title: "a.js",
    lineNumbers: true,
    highlight: "1",
    fontSize: 18,
    padding: 8,
    radius: 12,
    shadow: 60,
  };

  it.each(CODE_THEMES)("renders the %s theme", (theme) => {
    const svg = codeScreenshotSvg({ ...base, theme });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("NaN");
  });

  it("escapes code and title", () => {
    const svg = codeScreenshotSvg({ ...base, title: '<x">' });
    expect(svg).toContain("&lt;b&gt;&amp;");
    expect(svg).toContain("&lt;x&quot;&gt;");
    expect(svg).not.toContain("<b>");
  });

  it("scales a large window down to fit and never up", () => {
    const small = codeLayout({ ...base, code: "a" });
    expect(small.scale).toBe(1);
    const wide = codeLayout({ ...base, code: "x".repeat(150), width: 800, height: 600 });
    expect(wide.scale).toBeLessThan(1);
    expect(wide.naturalWidth * wide.scale).toBeLessThanOrEqual(800 - 2 * 0.08 * 600 + 1e-6);
  });
});
