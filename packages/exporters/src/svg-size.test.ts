import { describe, expect, it } from "vitest";
import { ExportError } from "./errors";
import { readSvgSize, resizeSvg } from "./svg-size";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect stroke-width="2" width="400" height="300"/></svg>';

describe("readSvgSize", () => {
  it("reads numeric root attributes", () => {
    expect(readSvgSize(svg)).toEqual({ width: 400, height: 300, viewBox: "0 0 400 300" });
    expect(readSvgSize('<svg width="10px" height="100%">')).toEqual({ width: 10 });
    expect(readSvgSize("<div/>")).toEqual({});
  });
});

describe("resizeSvg", () => {
  it("changes only the root size and keeps the viewBox and content", () => {
    const out = resizeSvg(svg, 1600, 1200);
    expect(out).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 400 300"><rect stroke-width="2" width="400" height="300"/></svg>',
    );
  });

  it("adds a viewBox from the original size when missing", () => {
    const out = resizeSvg("<svg width='40' height='30'><g/></svg>", 80.4, 60);
    expect(out).toBe('<svg width="80" height="60" viewBox="0 0 40 30"><g/></svg>');
  });

  it("keeps an XML declaration", () => {
    const out = resizeSvg('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"/>', 5, 5);
    expect(out).toBe('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1" width="5" height="5"/>');
  });

  it("rejects input without a usable root", () => {
    expect(() => resizeSvg("<html></html>", 1, 1)).toThrow(ExportError);
    expect(() => resizeSvg("<svg><g/></svg>", 1, 1)).toThrow(/viewBox/);
  });
});
