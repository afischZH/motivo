import { describe, expect, it } from "vitest";
import { paletteTextureData } from "../palette";
import { shaderGradientUniforms, type ShaderGradientOptions } from "../shader-gradient/uniforms";
import { SHADER_GRADIENT_FRAGMENT } from "../shader-gradient/fragment";
import { buildEmbedConfig, toBase64, type EmbedConfig } from "./config";
import { minifyGlsl } from "./glsl-minify";
import { EMBED_PLAYER_JS } from "./player";
import { embedGlsl, embedHtml, embedReact, embedWebComponent } from "./snippets";

const OPTIONS: ShaderGradientOptions = {
  style: "liquid",
  frequency: 1.2,
  amplitude: 1,
  warp: 0.9,
  detail: 4,
  angle: 0,
  zoom: 1,
  phase: 0.25,
  dither: "off",
  levels: 6,
  ditherScale: 2,
  grain: 0.08,
  vignette: 0.15,
  seed: 1,
};
const palette = paletteTextureData(["#1e1b4b", "#7c3aed", "#f472b6"]);
const source = {
  fragment: SHADER_GRADIENT_FRAGMENT,
  uniformsAt: (t: number) => shaderGradientUniforms(OPTIONS, t),
  palette,
  loopSeconds: 24,
};

describe("minifyGlsl", () => {
  it("drops comments and blank lines but keeps line breaks", () => {
    const out = minifyGlsl("#version 300 es\n// note\n  float a; /* x\n y */ float b;\n\n");
    expect(out).toBe("#version 300 es\nfloat a;  float b;");
  });
});

describe("toBase64", () => {
  it("matches Buffer for all padding cases", () => {
    for (const bytes of [[], [1], [1, 2], [1, 2, 3], [255, 0, 128, 7]]) {
      const data = Uint8Array.from(bytes);
      expect(toBase64(data)).toBe(Buffer.from(data).toString("base64"));
    }
  });
});

describe("buildEmbedConfig", () => {
  const config = buildEmbedConfig(source);

  it("splits static and moving uniforms", () => {
    expect(Object.keys(config.d)).toEqual(["u_off"]);
    expect(config.u.u_style).toBe(0);
    expect(config.u.u_salts).toEqual(shaderGradientUniforms(OPTIONS).u_salts);
    expect(config.n).toBe(48);
    expect(config.d.u_off).toHaveLength(48 * 8);
    expect(config.l).toBe(24);
  });

  it("sample 0 is the export frame (t = 0) and samples follow the loop", () => {
    const at0 = shaderGradientUniforms(OPTIONS, 0).u_off as number[];
    const at10 = shaderGradientUniforms(OPTIONS, 10 / 48).u_off as number[];
    const d = config.d.u_off ?? [];
    at0.forEach((v, i) => expect(d[i]).toBeCloseTo(v, 3));
    at10.forEach((v, i) => expect(d[80 + i]).toBeCloseTo(v, 3));
  });

  it("is still without a loop, and carries palette and fallback colour", () => {
    const still = buildEmbedConfig({ ...source, loopSeconds: 0 });
    expect(still.n).toBe(0);
    expect(still.l).toBe(0);
    expect(still.d).toEqual({});
    expect(still.u.u_off).toEqual(shaderGradientUniforms(OPTIONS, 0).u_off);
    expect(still.p).toBe(Buffer.from(palette).toString("base64"));
    expect(still.b).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("is deterministic JSON without NaN", () => {
    const json = JSON.stringify(config);
    expect(JSON.stringify(buildEmbedConfig(source))).toBe(json);
    expect(json).not.toMatch(/NaN|Infinity|null,"l"/);
  });

  it("rejects non-finite values", () => {
    expect(() => buildEmbedConfig({ ...source, uniformsAt: () => ({ u_x: Number.NaN }) })).toThrow(
      RangeError,
    );
  });
});

/** Fake WebGL2 + DOM, enough to run the player and record what it does. */
function runPlayer(config: EmbedConfig, opts: Record<string, unknown> = {}, reduced = false) {
  const calls: { name: string; args: unknown[] }[] = [];
  const names = Object.keys(config.u).concat(Object.keys(config.d), [
    "u_resolution",
    "u_tileOrigin",
    "u_tileSize",
    "u_design",
    "u_palette",
  ]);
  const gl = new Proxy(
    {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      LINK_STATUS: 4,
      ACTIVE_UNIFORMS: 5,
      getShaderParameter: () => true,
      getProgramParameter: (_: unknown, p: number) => (p === 5 ? names.length : true),
      getActiveUniform: (_: unknown, i: number) => ({
        name: names[i],
        type: names[i] === "u_palette" ? 35678 : names[i] === "u_style" ? 5124 : 35664,
        size: 1,
      }),
      getUniformLocation: (_: unknown, n: string) => ({ n }),
      getExtension: () => ({ loseContext: () => calls.push({ name: "loseContext", args: [] }) }),
    } as Record<string, unknown>,
    {
      get(target, key: string) {
        if (key in target) return target[key];
        return (...args: unknown[]) => {
          calls.push({ name: key, args });
          return {};
        };
      },
    },
  );
  const listeners: Record<string, () => void> = {};
  const canvas = {
    style: {} as Record<string, string>,
    width: 0,
    height: 0,
    parentNode: null as unknown,
    setAttribute() {},
    getContext: () => gl,
    addEventListener() {},
    removeEventListener() {},
  };
  const host = {
    style: {} as Record<string, string>,
    firstChild: null,
    insertBefore(node: typeof canvas) {
      node.parentNode = { removeChild: () => calls.push({ name: "removeChild", args: [] }) };
    },
    getBoundingClientRect: () => ({ width: 400, height: 250 }),
  };
  let frames = 0;
  const frameQueue: ((now: number) => void)[] = [];
  const window = {
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  };
  const document = {
    hidden: false,
    createElement: () => canvas,
    addEventListener: (k: string, f: () => void) => (listeners[k] = f),
    removeEventListener() {},
  };
  const run = new Function(
    "window",
    "document",
    "getComputedStyle",
    "performance",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "atob",
    `${EMBED_PLAYER_JS}\nreturn musterliShader;`,
  ) as (...args: unknown[]) => (h: unknown, c: unknown, o: unknown) => { destroy(): void };
  const play = run(
    window,
    document,
    () => ({ position: "static" }),
    { now: () => 0 },
    (f: (now: number) => void) => {
      frameQueue.push(f);
      return ++frames;
    },
    () => {},
    (s: string) => Buffer.from(s, "base64").toString("binary"),
  );
  const player = play(host, config, opts);
  return { calls, canvas, host, player, frameQueue };
}

describe("EMBED_PLAYER_JS", () => {
  const config = buildEmbedConfig(source);

  it("sets up the canvas behind the content and draws one frame", () => {
    const { calls, canvas, host } = runPlayer(config);
    expect(host.style.position).toBe("relative");
    expect(host.style.isolation).toBe("isolate");
    expect(host.style.backgroundColor).toBe(config.b);
    // maxDpr 1.5 caps devicePixelRatio 2.
    expect([canvas.width, canvas.height]).toEqual([600, 375]);
    expect(calls.filter((c) => c.name === "drawArrays")).toHaveLength(1);
    const design = calls.find(
      (c) => c.name === "uniform2fv" && (c.args[0] as { n: string }).n === "u_design",
    );
    expect(Array.from(design?.args[1] as Float32Array)).toEqual([400, 250]);
    const style = calls.find((c) => c.name === "uniform1iv");
    expect(Array.from(style?.args[1] as Int32Array)).toEqual([0]);
    const tex = calls.find((c) => c.name === "texImage2D");
    expect((tex?.args[8] as Uint8Array).length).toBe(1024);
  });

  it("animates in a loop at the requested frame rate", () => {
    const { calls, frameQueue } = runPlayer(config, { fps: 10 });
    const draws = () => calls.filter((c) => c.name === "drawArrays").length;
    expect(frameQueue).toHaveLength(1);
    const before = draws();
    frameQueue.shift()?.(50);
    expect(draws()).toBe(before + 1);
    frameQueue.shift()?.(120); // 70 ms later: too early for 10 fps
    expect(draws()).toBe(before + 1);
    frameQueue.shift()?.(160);
    expect(draws()).toBe(before + 2);
  });

  it("stays still with reduced motion and cleans up on destroy", () => {
    const { calls, frameQueue, player } = runPlayer(config, {}, true);
    expect(frameQueue).toHaveLength(0);
    player.destroy();
    expect(calls.map((c) => c.name)).toEqual(
      expect.arrayContaining(["loseContext", "removeChild"]),
    );
  });

  it("refuses unknown config versions", () => {
    const { calls } = runPlayer({ ...config, v: 2 });
    expect(calls).toHaveLength(0);
  });
});

describe("snippets", () => {
  const config = buildEmbedConfig(source);
  const opts = { title: "Shader gradient </script> -->" };

  it("are valid JavaScript", () => {
    expect(() => new Function(embedWebComponent(config, opts))).not.toThrow();
    const html = embedHtml(config, opts);
    const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
    expect(() => new Function(script)).not.toThrow();
    expect(script).not.toContain("</script");
    const react = embedReact(config, opts)
      .replace(/^import .*$/m, "const { createElement, useEffect, useRef } = {};")
      .replace("export default ", "");
    expect(() => new Function(react)).not.toThrow();
  });

  it("keep comments closed whatever the title", () => {
    const html = embedHtml(config, opts);
    expect(html.indexOf("-->")).toBe(html.indexOf("\n-->") + 1);
  });

  it("GLSL keeps #version first and lists the uniforms", () => {
    const glsl = embedGlsl(config, opts);
    expect(glsl.startsWith("#version 300 es\n")).toBe(true);
    expect(glsl).toContain("u_salts = [");
    expect(glsl).toContain("Moving uniforms (48 samples per 24 s loop");
  });
});

describe("size budget", () => {
  it("player under 3 KB and a full Web Component under 8 KB gzip", async () => {
    const { gzipSync } = await import("node:zlib");
    const player = gzipSync(EMBED_PLAYER_JS).length;
    const wc = gzipSync(embedWebComponent(buildEmbedConfig(source), { title: "x" })).length;
    console.info(`embed player ${player} B gzip, web component ${wc} B gzip`);
    expect(player).toBeLessThan(3 * 1024);
    expect(wc).toBeLessThan(8 * 1024);
  });
});
