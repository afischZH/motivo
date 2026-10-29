import { describe, expect, it } from "vitest";
import { ShaderBuildError } from "./build-errors";
import { createShaderRuntime, ShaderContextLostError, type ShaderCanvas } from "./runtime";
import { GL_TYPES } from "./uniforms";

/** WebGL2 enums the runtime reads from the context. */
const ENUMS = {
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  ACTIVE_UNIFORMS: 0x8b86,
  TEXTURE0: 0x84c0,
  TEXTURE_2D: 0x0de1,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  NEAREST: 0x2600,
  CLAMP_TO_EDGE: 0x812f,
  UNPACK_ALIGNMENT: 0x0cf5,
  RGBA8: 0x8058,
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
  TRIANGLES: 0x0004,
};

interface FakeOptions {
  failCompile?: string;
  uniforms?: { name: string; type: number; size: number }[];
}

/** A recording stand-in for `WebGL2RenderingContext` (only what the runtime calls). */
function fakeGl(options: FakeOptions = {}) {
  const calls: string[] = [];
  const state = { lost: false };
  const uniforms = options.uniforms ?? [
    { name: "u_resolution", type: GL_TYPES.FLOAT_VEC2, size: 1 },
    { name: "u_palette", type: GL_TYPES.SAMPLER_2D, size: 1 },
    { name: "u_amount", type: GL_TYPES.FLOAT, size: 1 },
    { name: "u_off[0]", type: GL_TYPES.FLOAT_VEC2, size: 2 },
  ];
  let sources = new Map<object, string>();
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.filter((a) => typeof a !== "object").join(",")})`);
      return result;
    };
  const gl = {
    ...ENUMS,
    isContextLost: () => state.lost,
    createShader: (type: number) => ({ type }),
    shaderSource: (s: object, src: string) => sources.set(s, src),
    compileShader: record("compileShader"),
    getShaderParameter: (s: object) =>
      !(options.failCompile && sources.get(s)?.includes(options.failCompile)),
    getShaderInfoLog: () => "ERROR: 0:2: 'oops' : syntax error",
    deleteShader: record("deleteShader"),
    createProgram: () => ({ program: true }),
    attachShader: record("attachShader"),
    detachShader: record("detachShader"),
    linkProgram: record("linkProgram"),
    getProgramParameter: (_p: object, what: number) =>
      what === ENUMS.ACTIVE_UNIFORMS ? uniforms.length : true,
    getProgramInfoLog: () => "",
    getActiveUniform: (_p: object, i: number) => uniforms[i],
    getUniformLocation: (_p: object, name: string) => ({ name }),
    deleteProgram: record("deleteProgram"),
    viewport: record("viewport"),
    useProgram: record("useProgram"),
    createVertexArray: () => ({ vao: true }),
    bindVertexArray: record("bindVertexArray"),
    deleteVertexArray: record("deleteVertexArray"),
    uniform2f: (l: { name: string }, a: number, b: number) =>
      calls.push(`uniform2f(${l.name},${a},${b})`),
    uniform1i: (l: { name: string }, v: number) => calls.push(`uniform1i(${l.name},${v})`),
    uniform1fv: (l: { name: string }, d: Float32Array) =>
      calls.push(`uniform1fv(${l.name},${[...d]})`),
    uniform2fv: (l: { name: string }, d: Float32Array) =>
      calls.push(`uniform2fv(${l.name},${[...d]})`),
    activeTexture: record("activeTexture"),
    createTexture: () => ({ texture: true }),
    bindTexture: record("bindTexture"),
    texParameteri: record("texParameteri"),
    pixelStorei: record("pixelStorei"),
    texImage2D: record("texImage2D"),
    deleteTexture: record("deleteTexture"),
    drawArrays: record("drawArrays"),
    readPixels: (
      _x: number,
      _y: number,
      w: number,
      h: number,
      _f: number,
      _t: number,
      out: Uint8Array,
    ) => {
      out.fill(7);
      calls.push(`readPixels(${w},${h})`);
    },
    getExtension: () => ({ loseContext: record("loseContext") }),
  };
  return { gl, calls, state, resetSources: () => (sources = new Map()) };
}

function fakeCanvas(gl: unknown) {
  const listeners = new Map<string, (e: Event) => void>();
  const canvas = {
    width: 1,
    height: 1,
    getContext: () => gl,
    addEventListener: (type: string, fn: (e: Event) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const fire = (type: string) => {
    let prevented = false;
    listeners.get(type)?.({ preventDefault: () => (prevented = true) } as unknown as Event);
    return prevented;
  };
  return { canvas: canvas as unknown as ShaderCanvas, fire, listeners };
}

const frame = (extra: Record<string, unknown> = {}) => ({
  fragment: "#version 300 es\nvoid main() {}",
  uniforms: { u_amount: 0.5, u_off: [1, 2, 3, 4] },
  palette: new Uint8Array(256 * 4),
  out: { width: 300, height: 200 },
  design: { width: 600, height: 400 },
  ...extra,
});

describe("createShaderRuntime", () => {
  it("returns null without a WebGL2 context", () => {
    expect(createShaderRuntime(fakeCanvas(null).canvas)).toBeNull();
    const throwing = {
      getContext: () => {
        throw new Error("no");
      },
    } as unknown as ShaderCanvas;
    expect(createShaderRuntime(throwing)).toBeNull();
  });

  it("draws a tile: resizes the canvas, sets runtime and tool uniforms, palette, triangle", () => {
    const { gl, calls } = fakeGl();
    const { canvas } = fakeCanvas(gl);
    const runtime = createShaderRuntime(canvas);
    if (!runtime) throw new Error("no runtime");
    runtime.draw(frame({ tile: { x: 100, y: 50, width: 64, height: 32 } }));
    expect([canvas.width, canvas.height]).toEqual([64, 32]);
    expect(calls).toContain("viewport(0,0,64,32)");
    expect(calls).toContain("uniform2f(u_resolution,300,200)");
    expect(calls).toContain("uniform1i(u_palette,0)");
    expect(calls).toContain("uniform1fv(u_amount,0.5)");
    expect(calls).toContain("uniform2fv(u_off[0],1,2,3,4)");
    expect(calls.filter((c) => c.startsWith("texImage2D"))).toHaveLength(1);
    expect(calls.at(-1)).toBe(`drawArrays(${ENUMS.TRIANGLES},0,3)`);
    expect(runtime.readPixels()).toHaveLength(64 * 32 * 4);
  });

  it("compiles each fragment once and uploads an unchanged palette once", () => {
    const { gl, calls } = fakeGl();
    const runtime = createShaderRuntime(fakeCanvas(gl).canvas);
    runtime?.draw(frame());
    runtime?.draw(frame());
    expect(calls.filter((c) => c.startsWith("linkProgram"))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("texImage2D"))).toHaveLength(1);
    runtime?.draw(frame({ palette: new Uint8Array(256 * 4).fill(9) }));
    expect(calls.filter((c) => c.startsWith("texImage2D"))).toHaveLength(2);
  });

  it("reports compile errors with the source line", () => {
    const { gl } = fakeGl({ failCompile: "oops" });
    const runtime = createShaderRuntime(fakeCanvas(gl).canvas);
    let error: unknown;
    try {
      runtime?.draw(frame({ fragment: "#version 300 es\noops;\nvoid main() {}" }));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ShaderBuildError);
    expect((error as ShaderBuildError).stage).toBe("fragment");
    expect((error as Error).message).toContain(">    2 | oops;");
  });

  it("refuses missing uniforms and a missing palette", () => {
    const { gl } = fakeGl();
    const runtime = createShaderRuntime(fakeCanvas(gl).canvas);
    expect(() => runtime?.draw(frame({ uniforms: { u_off: [1, 2, 3, 4] } }))).toThrow(/u_amount/);
    expect(() => runtime?.draw(frame({ palette: null }))).toThrow(/palette/);
  });

  it("throws ShaderContextLostError while the context is lost and recovers after restore", () => {
    const { gl, calls, state } = fakeGl();
    const { canvas, fire } = fakeCanvas(gl);
    const runtime = createShaderRuntime(canvas);
    runtime?.draw(frame());
    expect(fire("webglcontextlost")).toBe(true);
    state.lost = true;
    expect(runtime?.isLost()).toBe(true);
    expect(() => runtime?.draw(frame())).toThrow(ShaderContextLostError);
    state.lost = false;
    fire("webglcontextrestored");
    runtime?.draw(frame());
    // Programs and textures were rebuilt on the restored context.
    expect(calls.filter((c) => c.startsWith("linkProgram"))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith("texImage2D"))).toHaveLength(2);
  });

  it("dispose frees the context and removes its listeners", () => {
    const { gl, calls } = fakeGl();
    const { canvas, listeners } = fakeCanvas(gl);
    const runtime = createShaderRuntime(canvas);
    runtime?.draw(frame());
    runtime?.dispose();
    expect(calls).toContain("loseContext()");
    expect(listeners.size).toBe(0);
    expect(runtime?.isLost()).toBe(true);
  });
});
