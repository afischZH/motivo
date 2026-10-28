import { describe, expect, it } from "vitest";
import { registry } from "./index";
import {
  hasWebglReference,
  isWebglTool,
  renderWebglReference,
  webglFrame,
  webglLoopSeconds,
} from "./webgl";

function tool_(id: string) {
  const t = registry.get(id);
  if (!t) throw new Error(`missing tool ${id}`);
  return t;
}

const tool = tool_("shader-gradient");
const blob = tool_("blob");
const design = { width: 160, height: 100 };

describe("webgl helpers", () => {
  it("recognises WebGL tools", () => {
    expect(isWebglTool(tool)).toBe(true);
    expect(isWebglTool(blob)).toBe(false);
    expect(hasWebglReference(tool)).toBe(true);
    expect(hasWebglReference(blob)).toBe(false);
  });

  it("builds a frame with fragment, uniforms and a cached palette texture", () => {
    const a = webglFrame(tool, tool.defaults, 1, design);
    const b = webglFrame(tool, tool.defaults, 1, design);
    expect(a.fragment).toContain("#version 300 es");
    expect(a.palette).toBeInstanceOf(Uint8Array);
    expect(a.palette).toBe(b.palette);
    expect(a.uniforms).toEqual(b.uniforms);
    expect(webglFrame(tool, tool.defaults, 2, design).uniforms).not.toEqual(a.uniforms);
    expect(webglFrame(tool, tool.defaults, 1, design, 0.25).uniforms).not.toEqual(a.uniforms);
  });

  it("throws for other tools", () => {
    expect(() => webglFrame(blob, blob.defaults, 1, design)).toThrow(TypeError);
    expect(() => renderWebglReference(blob, blob.defaults, 1, design, design)).toThrow(TypeError);
  });

  it("renders the CPU reference at the output size", () => {
    const out = renderWebglReference(tool, tool.defaults, 1, design, { width: 32, height: 20 });
    expect(out.width).toBe(32);
    expect(out.height).toBe(20);
    expect(out.data.length).toBe(32 * 20 * 4);
  });

  it("reports the preview loop length", () => {
    expect(webglLoopSeconds(tool, { ...tool.defaults, speed: 0.5 })).toBe(24);
    expect(webglLoopSeconds(tool, { ...tool.defaults, speed: 0 })).toBe(0);
    expect(webglLoopSeconds(blob, blob.defaults)).toBe(0);
  });
});
