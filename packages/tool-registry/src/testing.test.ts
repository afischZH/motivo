import { describe, expect, it } from "vitest";
import { circleTool } from "./__fixtures__/circle-tool";
import { checkSvg, describePresetSnapshots, describeToolContract, renderStatic } from "./testing";

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe("checkSvg", () => {
  it("accepts compact well-formed SVG", () => {
    expect(
      checkSvg(`<svg ${NS} viewBox="0 0 10 10"><g fill="#fff"><path d="M0 0h10"/></g></svg>`),
    ).toEqual([]);
    expect(
      checkSvg(`<svg ${NS} width="10" height="10"><!-- c --><rect width="1" height="1"/></svg>`),
    ).toEqual([]);
  });

  it.each([
    ["missing root", `<g ${NS}></g>`],
    ["missing xmlns", `<svg viewBox="0 0 1 1"></svg>`],
    ["missing size", `<svg ${NS}></svg>`],
    ["unclosed element", `<svg ${NS} viewBox="0 0 1 1"><g></svg>`],
    ["mismatched close", `<svg ${NS} viewBox="0 0 1 1"><g></rect></svg>`],
    ["NaN leak", `<svg ${NS} viewBox="0 0 1 1"><circle r="NaN"/></svg>`],
    ["undefined leak", `<svg ${NS} viewBox="0 0 1 1"><circle fill="undefined"/></svg>`],
    ["unquoted attribute", `<svg ${NS} viewBox="0 0 1 1"><circle r=1/></svg>`],
    ["two roots", `<svg ${NS} viewBox="0 0 1 1"></svg><svg ${NS} viewBox="0 0 1 1"></svg>`],
  ])("rejects %s", (_, svg) => {
    expect(checkSvg(svg).length).toBeGreaterThan(0);
  });
});

describe("renderStatic", () => {
  it("renders the svg fixture deterministically", () => {
    const a = renderStatic(circleTool, circleTool.defaults, 1, { width: 100, height: 100 });
    expect(a).toBe(renderStatic(circleTool, circleTool.defaults, 1, { width: 100, height: 100 }));
    expect(a).toContain("<circle");
  });

  it("validates params before rendering", () => {
    expect(() =>
      renderStatic(circleTool, { ...circleTool.defaults, radius: 2 }, 1, { width: 10, height: 10 }),
    ).toThrow();
  });
});

describeToolContract(circleTool);
describePresetSnapshots(circleTool);
