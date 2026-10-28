import { describe, expect, it } from "vitest";
import { ShaderBuildError, formatShaderLog, shaderBuildError } from "./build-errors";

const SOURCE = [
  "#version 300 es",
  "precision highp float;",
  "out vec4 c;",
  "void main() { c = foo; }",
].join("\n");

describe("shader build errors", () => {
  it("shows the source line an error points at", () => {
    const text = formatShaderLog(SOURCE, "ERROR: 0:4: 'foo' : undeclared identifier\n\0");
    expect(text).toContain("ERROR: 0:4: 'foo' : undeclared identifier");
    expect(text).toContain(">    4 | void main() { c = foo; }");
    expect(text).toContain("     3 | out vec4 c;");
  });

  it("keeps unknown log formats and ignores out-of-range lines", () => {
    expect(formatShaderLog(SOURCE, "something odd")).toBe("something odd");
    expect(formatShaderLog(SOURCE, "ERROR: 0:99: x")).toBe("ERROR: 0:99: x");
  });

  it("builds a typed error per stage", () => {
    const error = shaderBuildError("fragment", SOURCE, "ERROR: 0:4: bad");
    expect(error).toBeInstanceOf(ShaderBuildError);
    expect(error.stage).toBe("fragment");
    expect(error.message).toContain("Shader fragment failed");
    expect(error.message).toContain(">    4 |");
    expect(shaderBuildError("link", SOURCE, " link log ").message).toBe(
      "Shader link failed:\nlink log",
    );
  });
});
