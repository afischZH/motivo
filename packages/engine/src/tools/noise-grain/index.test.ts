import { describe, expect, it } from "vitest";
import { type NoiseGrainSvgOptions, noiseGrainSvg } from "./index";

const opts: NoiseGrainSvgOptions = {
  width: 400,
  height: 300,
  base: "solid",
  color: "#808080",
  colors: ["#ff0000", "#0000ff"],
  angle: 90,
  opacity: 0.35,
  blend: "overlay",
  tileHref: "data:image/png;base64,AAAA",
  tileEdge: 256,
};

describe("noiseGrainSvg", () => {
  it("draws a solid base and the blended grain pattern at the tile size", () => {
    const svg = noiseGrainSvg(opts);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="400" height="300"/);
    expect(svg).toContain('<rect width="400" height="300" fill="#808080"/>');
    expect(svg).toMatch(
      /<pattern id="g\w+" width="256" height="256" patternUnits="userSpaceOnUse">/,
    );
    expect(svg).toContain('xlink:href="data:image/png;base64,AAAA"');
    expect(svg).toContain('opacity="0.35" style="mix-blend-mode:overlay"');
    expect(svg).toContain("image-rendering:pixelated");
  });

  it("references the pattern by its id", () => {
    const svg = noiseGrainSvg(opts);
    const id = /<pattern id="(\w+)"/.exec(svg)?.[1];
    expect(svg).toContain(`fill="url(#${id ?? "?"})"`);
  });

  it("renders linear and radial gradients with evenly spaced stops", () => {
    const colors = ["#111111", "#222222", "#333333"];
    const linear = noiseGrainSvg({ ...opts, base: "linear", colors });
    expect(linear).toMatch(/<linearGradient id="l\w+" x1="0" y1="0.5" x2="1" y2="0.5">/);
    expect(linear).toContain('<stop offset="0.5" stop-color="#222222"/>');
    const radial = noiseGrainSvg({ ...opts, base: "radial", colors });
    expect(radial).toMatch(/<radialGradient id="r\w+" cx="0.5" cy="0.5" r="0.71">/);
    expect(radial).toContain('<stop offset="1" stop-color="#333333"/>');
  });

  it("leaves the canvas transparent for base none", () => {
    const svg = noiseGrainSvg({ ...opts, base: "none" });
    expect(svg).not.toContain('fill="#808080"');
    expect(svg.match(/<rect /g)).toHaveLength(1);
  });

  it("omits the grain layer at zero opacity and clamps the opacity", () => {
    expect(noiseGrainSvg({ ...opts, opacity: 0 })).not.toContain("<pattern");
    expect(noiseGrainSvg({ ...opts, opacity: 0, base: "solid" })).not.toContain("<defs>");
    expect(noiseGrainSvg({ ...opts, opacity: 3 })).toContain('opacity="1"');
  });

  it("uses the blend mode as given", () => {
    expect(noiseGrainSvg({ ...opts, blend: "multiply" })).toContain("mix-blend-mode:multiply");
    expect(noiseGrainSvg({ ...opts, blend: "soft-light" })).toContain("mix-blend-mode:soft-light");
  });
});
