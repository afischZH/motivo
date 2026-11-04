/**
 * S2 shader backgrounds (dot wave, liquid chrome, caustics, light beams):
 * seamless loops, deterministic CPU twins, opaque output, and fragments
 * that declare every uniform the TypeScript side sends.
 */
import { describe, expect, it } from "vitest";
import { causticsUniforms, type CausticsOptions } from "./caustics/uniforms";
import { renderCausticsCpu } from "./caustics/cpu";
import { CAUSTICS_FRAGMENT } from "./caustics/fragment";
import { dotWaveUniforms, type DotWaveOptions } from "./dot-wave/uniforms";
import { renderDotWaveCpu } from "./dot-wave/cpu";
import { DOT_WAVE_FRAGMENT } from "./dot-wave/fragment";
import { lightBeamsUniforms, type LightBeamsOptions } from "./light-beams/uniforms";
import { renderLightBeamsCpu } from "./light-beams/cpu";
import { LIGHT_BEAMS_FRAGMENT } from "./light-beams/fragment";
import { liquidChromeUniforms, type LiquidChromeOptions } from "./liquid-chrome/uniforms";
import { renderLiquidChromeCpu } from "./liquid-chrome/cpu";
import { LIQUID_CHROME_FRAGMENT } from "./liquid-chrome/fragment";
import type { ShaderFrameInput } from "./frame";
import { paletteTextureData } from "./palette";

const DESIGN = { width: 64, height: 40 };
const PALETTE = paletteTextureData(["#0b132b", "#3a86ff", "#e0fbfc"]);

type Uniforms = ShaderFrameInput["uniforms"];
interface Case {
  id: string;
  fragment: string;
  uniforms: (seed: number, phase: number, t: number) => Uniforms;
  cpu: (input: ShaderFrameInput) => { data: Uint8ClampedArray };
}

const dot: Omit<DotWaveOptions, "seed" | "phase"> = {
  field: "noise",
  shape: "dot",
  spacing: 8,
  minSize: 0.1,
  maxSize: 0.9,
  frequency: 2,
  angle: 30,
  warp: 0.6,
  fade: 0.3,
  background: "#101018",
  grain: 0.1,
  vignette: 0.2,
};
const chrome: Omit<LiquidChromeOptions, "seed" | "phase"> = {
  frequency: 0.8,
  warp: 0.7,
  detail: 3,
  relief: 0.35,
  bands: 1.5,
  light: 45,
  specular: 0.6,
  iridescence: 0.2,
  angle: 0,
  grain: 0.05,
  vignette: 0.1,
  highlight: "#ffffff",
};
const caustic: Omit<CausticsOptions, "seed" | "phase"> = {
  style: "caustics",
  scale: 5,
  jitter: 0.8,
  warp: 0.5,
  edge: 0.4,
  contrast: 1,
  angle: 0,
  grain: 0.05,
  vignette: 0.1,
};
const beams: Omit<LightBeamsOptions, "seed" | "phase"> = {
  sourceX: 0.5,
  sourceY: -0.1,
  direction: 90,
  spread: 120,
  density: 6,
  sharpness: 3,
  decay: 1,
  intensity: 1,
  haze: 0.3,
  grain: 0.05,
  vignette: 0.1,
  width: DESIGN.width,
  height: DESIGN.height,
};

const CASES: Case[] = [
  {
    id: "dot-wave",
    fragment: DOT_WAVE_FRAGMENT,
    uniforms: (seed, phase, t) => dotWaveUniforms({ ...dot, seed, phase }, t),
    cpu: renderDotWaveCpu,
  },
  {
    id: "liquid-chrome",
    fragment: LIQUID_CHROME_FRAGMENT,
    uniforms: (seed, phase, t) => liquidChromeUniforms({ ...chrome, seed, phase }, t),
    cpu: renderLiquidChromeCpu,
  },
  {
    id: "caustics",
    fragment: CAUSTICS_FRAGMENT,
    uniforms: (seed, phase, t) => causticsUniforms({ ...caustic, seed, phase }, t),
    cpu: renderCausticsCpu,
  },
  {
    id: "light-beams",
    fragment: LIGHT_BEAMS_FRAGMENT,
    uniforms: (seed, phase, t) => lightBeamsUniforms({ ...beams, seed, phase }, t),
    cpu: renderLightBeamsCpu,
  },
];

const bytes = (data: Uint8ClampedArray): string => data.join(",");

describe.each(CASES)("$id", ({ fragment, uniforms, cpu }) => {
  const render = (seed: number, phase = 0, t = 0) =>
    cpu({ uniforms: uniforms(seed, phase, t), palette: PALETTE, out: DESIGN, design: DESIGN });

  it("declares every uniform it is sent", () => {
    for (const name of Object.keys(uniforms(1, 0, 0))) {
      expect(fragment).toMatch(new RegExp(`uniform \\w+ ${name}\\b`));
    }
  });

  it("loops seamlessly: t = 1 renders the same picture as t = 0", () => {
    expect(bytes(render(3, 0.2, 1).data)).toBe(bytes(render(3, 0.2, 0).data));
    expect(bytes(render(3, 0.2, 0.5).data)).not.toBe(bytes(render(3, 0.2, 0).data));
  });

  it("is deterministic, depends on the seed and is opaque", () => {
    const a = render(1);
    expect(bytes(render(1).data)).toBe(bytes(a.data));
    expect(bytes(render(2).data)).not.toBe(bytes(a.data));
    for (let i = 3; i < a.data.length; i += 4) expect(a.data[i]).toBe(255);
  });

  it("renders a tile exactly like the same part of the full picture", () => {
    const full = render(5);
    const tile = cpu({
      uniforms: uniforms(5, 0, 0),
      palette: PALETTE,
      out: DESIGN,
      design: DESIGN,
      tile: { x: 16, y: 8, width: 20, height: 12 },
    });
    for (let row = 0; row < 12; row++) {
      const a = full.data.subarray(
        ((row + 8) * DESIGN.width + 16) * 4,
        ((row + 8) * DESIGN.width + 36) * 4,
      );
      const b = tile.data.subarray(row * 20 * 4, (row + 1) * 20 * 4);
      expect(bytes(b)).toBe(bytes(a));
    }
  });
});
