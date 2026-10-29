/**
 * What one shader render needs, independent of where it runs (GPU runtime
 * or CPU reference).
 */
import type { ShaderTile } from "./tiles";
import type { UniformValue } from "./uniforms";

export interface PixelSize {
  width: number;
  height: number;
}

export interface ShaderFrameInput {
  /** The tool's uniforms (`WebglRenderer.uniforms`). */
  uniforms: Readonly<Record<string, UniformValue>>;
  /** RGBA palette texture (`paletteTextureData`), or `null` without a ramp. */
  palette: Uint8Array | null;
  /** Output size in pixels (`u_resolution`). */
  out: PixelSize;
  /** Design size of the render context (`u_design`). */
  design: PixelSize;
  /** Part of the output to render; default: all of it. */
  tile?: ShaderTile;
}

/** A frame plus its fragment shader: everything the GPU runtime draws. */
export interface ShaderFrame extends ShaderFrameInput {
  fragment: string;
}

/** Uniform names the runtime sets for every tile; tools must not use them. */
export const RUNTIME_UNIFORMS: ReadonlySet<string> = new Set([
  "u_resolution",
  "u_tileOrigin",
  "u_tileSize",
  "u_design",
  "u_palette",
]);
