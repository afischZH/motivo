/**
 * Thin WebGL2 runtime (`@musterli/shaders/runtime`, browser only): compiles
 * and links fragment shaders with readable errors, draws a fullscreen
 * triangle per tile, sets uniforms (`packUniforms`) and the palette texture,
 * reads pixels back, and survives context loss. The canvas is passed in
 * (an `OffscreenCanvas` in the shader worker), so the module never touches
 * the DOM itself.
 */
import { shaderBuildError } from "./build-errors";
import { RUNTIME_UNIFORMS, type ShaderFrame } from "./frame";
import { PALETTE_TEXTURE_SIZE } from "./palette";
import { packUniforms, uniformBaseName, type UniformCall, type UniformInfo } from "./uniforms";

/** Fullscreen triangle from `gl_VertexID`: no buffers, no attributes. */
export const FULLSCREEN_VERTEX = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** The context was lost: dispose the runtime and create a new one. */
export class ShaderContextLostError extends Error {
  constructor() {
    super("WebGL context lost");
    this.name = "ShaderContextLostError";
  }
}

/** A canvas the runtime can draw on. */
export type ShaderCanvas = OffscreenCanvas | HTMLCanvasElement;

export interface ShaderRuntime {
  readonly canvas: ShaderCanvas;
  /**
   * Draws `frame.tile` (default: the whole output) into the canvas, which
   * is resized to the tile. Throws `ShaderBuildError` (the shader does not
   * compile or link), `UniformError` or `ShaderContextLostError`.
   */
  draw(frame: ShaderFrame): void;
  /** RGBA of what `draw` left in the canvas, bottom row first (`readPixels`). */
  readPixels(): Uint8Array;
  isLost(): boolean;
  /** Frees programs, texture and the context. */
  dispose(): void;
}

interface Program {
  program: WebGLProgram;
  infos: UniformInfo[];
  locations: Map<string, WebGLUniformLocation>;
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
};

/** Programs kept per runtime (one per tool shader; the editor shows one tool). */
const PROGRAM_CACHE = 4;

function getContext(canvas: ShaderCanvas): WebGL2RenderingContext | null {
  try {
    return (canvas as OffscreenCanvas).getContext(
      "webgl2",
      CONTEXT_ATTRIBUTES,
    ) as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}

/** A runtime on `canvas`, or `null` without WebGL2. */
export function createShaderRuntime(canvas: ShaderCanvas): ShaderRuntime | null {
  const gl = getContext(canvas);
  if (!gl) return null;

  let lost = false;
  const programs = new Map<string, Program>();
  let vao: WebGLVertexArrayObject | null = null;
  let texture: WebGLTexture | null = null;
  let uploaded: Uint8Array | null = null;

  const reset = () => {
    programs.clear();
    vao = null;
    texture = null;
    uploaded = null;
  };
  const target = canvas as unknown as EventTarget;
  const onLost = (event: Event) => {
    // Lets the browser restore the context; until then every draw throws.
    event.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    reset();
    lost = false;
  };
  target.addEventListener("webglcontextlost", onLost);
  target.addEventListener("webglcontextrestored", onRestored);

  const assertAlive = () => {
    if (lost || gl.isContextLost()) {
      lost = true;
      throw new ShaderContextLostError();
    }
  };

  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) {
      assertAlive();
      throw new Error("createShader failed");
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      assertAlive();
      const log = gl.getShaderInfoLog(shader) ?? "";
      gl.deleteShader(shader);
      throw shaderBuildError(type === gl.VERTEX_SHADER ? "vertex" : "fragment", source, log);
    }
    return shader;
  };

  const build = (fragment: string): Program => {
    const cached = programs.get(fragment);
    if (cached) {
      // Most recently used last.
      programs.delete(fragment);
      programs.set(fragment, cached);
      return cached;
    }
    const vs = compile(gl.VERTEX_SHADER, FULLSCREEN_VERTEX);
    let fs: WebGLShader;
    try {
      fs = compile(gl.FRAGMENT_SHADER, fragment);
    } catch (error) {
      gl.deleteShader(vs);
      throw error;
    }
    const program = gl.createProgram();
    if (!program) {
      assertAlive();
      throw new Error("createProgram failed");
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.detachShader(program, vs);
    gl.detachShader(program, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      assertAlive();
      const log = gl.getProgramInfoLog(program) ?? "";
      gl.deleteProgram(program);
      throw shaderBuildError("link", fragment, log);
    }
    const infos: UniformInfo[] = [];
    const locations = new Map<string, WebGLUniformLocation>();
    const count = Number(gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) ?? 0);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const location = gl.getUniformLocation(program, info.name);
      if (!location) continue;
      infos.push({ name: info.name, type: info.type, size: info.size });
      locations.set(uniformBaseName(info.name), location);
    }
    const entry: Program = { program, infos, locations };
    programs.set(fragment, entry);
    while (programs.size > PROGRAM_CACHE) {
      const oldest = programs.keys().next().value;
      if (oldest === undefined) break;
      const evicted = programs.get(oldest);
      if (evicted) gl.deleteProgram(evicted.program);
      programs.delete(oldest);
    }
    return entry;
  };

  const samePalette = (data: Uint8Array): boolean => {
    if (!uploaded || uploaded.length !== data.length) return false;
    for (let i = 0; i < data.length; i++) if (uploaded[i] !== data[i]) return false;
    return true;
  };

  const bindPalette = (data: Uint8Array) => {
    if (data.length !== PALETTE_TEXTURE_SIZE * 4) {
      throw new RangeError(`Palette texture must hold ${PALETTE_TEXTURE_SIZE} RGBA texels`);
    }
    gl.activeTexture(gl.TEXTURE0);
    if (!texture) {
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      uploaded = null;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    if (!samePalette(data)) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        PALETTE_TEXTURE_SIZE,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      uploaded = data.slice();
    }
  };

  const apply = (location: WebGLUniformLocation, call: UniformCall) => {
    const { data } = call;
    switch (call.method) {
      case "uniformMatrix2fv":
      case "uniformMatrix3fv":
      case "uniformMatrix4fv":
        gl[call.method](location, false, data as Float32Array);
        return;
      case "uniform1fv":
      case "uniform2fv":
      case "uniform3fv":
      case "uniform4fv":
        gl[call.method](location, data as Float32Array);
        return;
      case "uniform1iv":
      case "uniform2iv":
      case "uniform3iv":
      case "uniform4iv":
        gl[call.method](location, data as Int32Array);
        return;
      default:
        gl[call.method](location, data as Uint32Array);
    }
  };

  return {
    canvas,
    draw(frame) {
      assertAlive();
      const tile = frame.tile ?? { x: 0, y: 0, width: frame.out.width, height: frame.out.height };
      if (canvas.width !== tile.width) canvas.width = tile.width;
      if (canvas.height !== tile.height) canvas.height = tile.height;
      const prog = build(frame.fragment);
      const calls = packUniforms(frame.uniforms, prog.infos, RUNTIME_UNIFORMS);
      gl.viewport(0, 0, tile.width, tile.height);
      gl.useProgram(prog.program);
      vao ??= gl.createVertexArray();
      gl.bindVertexArray(vao);
      const loc = (name: string) => prog.locations.get(name);
      const set2 = (name: string, a: number, b: number) => {
        const l = loc(name);
        if (l) gl.uniform2f(l, a, b);
      };
      set2("u_resolution", frame.out.width, frame.out.height);
      set2("u_tileOrigin", tile.x, tile.y);
      set2("u_tileSize", tile.width, tile.height);
      set2("u_design", frame.design.width, frame.design.height);
      const paletteLoc = loc("u_palette");
      if (paletteLoc) {
        if (!frame.palette) throw new TypeError("This shader samples u_palette: pass a palette");
        bindPalette(frame.palette);
        gl.uniform1i(paletteLoc, 0);
      }
      for (const call of calls) {
        const l = loc(call.name);
        if (l) apply(l, call);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      assertAlive();
    },
    readPixels() {
      assertAlive();
      const out = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
      assertAlive();
      return out;
    },
    isLost: () => lost || gl.isContextLost(),
    dispose() {
      target.removeEventListener("webglcontextlost", onLost);
      target.removeEventListener("webglcontextrestored", onRestored);
      if (!gl.isContextLost()) {
        for (const p of programs.values()) gl.deleteProgram(p.program);
        if (texture) gl.deleteTexture(texture);
        if (vao) gl.deleteVertexArray(vao);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      reset();
      lost = true;
    },
  };
}
