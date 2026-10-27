import { describe, expect, it } from "vitest";
import { bboxGradientVector, stableId, svgBackground, svgDocument } from "./svg";

describe("svgDocument", () => {
  it("wraps content in a sized root with viewBox", () => {
    expect(svgDocument(100, 50.5, "<g/>")).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50.5" viewBox="0 0 100 50.5"><g/></svg>',
    );
  });
});

describe("svgBackground", () => {
  it("draws a rect for colours and nothing for transparent", () => {
    expect(svgBackground("#fff", 10, 20)).toBe('<rect width="10" height="20" fill="#fff"/>');
    expect(svgBackground("transparent", 10, 20)).toBe("");
  });
});

describe("stableId", () => {
  it("is deterministic, prefixed and content dependent", () => {
    expect(stableId("g", "abc")).toBe(stableId("g", "abc"));
    expect(stableId("g", "abc")).toMatch(/^g[0-9a-z]+$/);
    expect(stableId("g", "abc")).not.toBe(stableId("g", "abd"));
  });
});

describe("bboxGradientVector", () => {
  it("follows CSS angle semantics", () => {
    expect(bboxGradientVector(0)).toBe('x1="0.5" y1="1" x2="0.5" y2="0"');
    expect(bboxGradientVector(90)).toBe('x1="0" y1="0.5" x2="1" y2="0.5"');
  });
});
