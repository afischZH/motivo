import { describe, expect, it } from "vitest";
import { contrastCheckerSvg, contrastReport, type ContrastCheckerOptions } from "./index";

const base: ContrastCheckerOptions = {
  width: 1200,
  height: 800,
  foreground: "#5b6b7f",
  background: "#ffffff",
  sample: "body",
  simulation: "none",
  pairs: false,
  palette: ["#ffffff", "#000000", "#e76f51"],
};

describe("contrastCheckerSvg", () => {
  it("shows the ratio rounded down and one pass/fail mark per WCAG check", () => {
    const svg = contrastCheckerSvg(base);
    expect(svg).toContain(">5.4:1<"); // 5.47:1 rounded down
    expect(svg.match(/fill="#15803d"/g)).toHaveLength(4); // AA, large AA/AAA, UI pass
    expect(svg.match(/fill="#b91c1c"/g)).toHaveLength(1); // AAA for body text fails
  });

  it("adds the simulated card with its own ratio", () => {
    const plain = contrastCheckerSvg({ ...base, foreground: "#d62828", background: "#2a9d55" });
    const sim = contrastCheckerSvg({
      ...base,
      foreground: "#d62828",
      background: "#2a9d55",
      simulation: "deuteranopia",
    });
    expect(sim.length).toBeGreaterThan(plain.length);
    expect(sim).toContain("<circle"); // eye of the badge
  });

  it("draws a matrix for palette pairs", () => {
    const svg = contrastCheckerSvg({ ...base, pairs: true });
    expect(svg).toContain(">21.0:1 AAA<");
    expect(svg.match(/>Aa</g)).toHaveLength(6); // 3 × 3 without the diagonal
  });

  it("works on portrait canvases and every sample", () => {
    for (const sample of ["heading", "body", "ui"] as const) {
      const svg = contrastCheckerSvg({ ...base, width: 600, height: 1000, sample });
      expect(svg).toMatch(/^<svg /);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });
});

describe("contrastReport", () => {
  it("lists colours, ratio and every level", () => {
    const report = contrastReport(base);
    expect(report).toContain("Text color:    #5b6b7f");
    expect(report).toContain("Contrast:      5.4:1");
    expect(report).toContain("Normal text   AA   4.5:1   pass");
    expect(report).toContain("Normal text   AAA  7:1     fail");
    expect(report).toContain("UI components AA   3:1     pass");
    expect(report).not.toContain("Simulation");
  });

  it("adds simulation and pairs when enabled", () => {
    const report = contrastReport({ ...base, simulation: "achromatopsia", pairs: true });
    expect(report).toContain("Simulation:    achromatopsia");
    expect(report).toContain("#000000 on #ffffff  21.0:1 AAA");
  });
});
