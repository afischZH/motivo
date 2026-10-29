/**
 * Readable shader build errors (pure): the driver's info log, with each
 * reported line shown next to the source line it points at.
 */

export type ShaderStage = "vertex" | "fragment" | "link";

export class ShaderBuildError extends Error {
  readonly stage: ShaderStage;
  /** The driver's raw info log. */
  readonly log: string;
  constructor(stage: ShaderStage, log: string, message: string) {
    super(message);
    this.name = "ShaderBuildError";
    this.stage = stage;
    this.log = log;
  }
}

/** `ERROR: 0:42: 'foo' : undeclared identifier` and similar driver formats. */
const LINE_REF = /^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/;

/**
 * Formats an info log: every `ERROR: 0:<line>: …` entry gets the offending
 * source line (and its neighbours) with a marker. Unknown formats are kept
 * as they are.
 */
export function formatShaderLog(source: string, log: string, context = 1): string {
  const lines = source.split("\n");
  const out: string[] = [];
  for (const entry of log.split("\n")) {
    const text = entry.replace(/\0/g, "").trimEnd();
    if (text === "") continue;
    out.push(text);
    const match = LINE_REF.exec(text);
    if (!match) continue;
    const at = Number(match[1]);
    if (!Number.isInteger(at) || at < 1 || at > lines.length) continue;
    for (let n = Math.max(1, at - context); n <= Math.min(lines.length, at + context); n++) {
      out.push(`${n === at ? ">" : " "} ${String(n).padStart(4)} | ${lines[n - 1] ?? ""}`);
    }
  }
  return out.join("\n");
}

/** The error thrown when a shader stage does not compile or link. */
export function shaderBuildError(
  stage: ShaderStage,
  source: string,
  log: string,
): ShaderBuildError {
  const detail = stage === "link" ? log.trim() : formatShaderLog(source, log);
  return new ShaderBuildError(stage, log, `Shader ${stage} failed:\n${detail}`);
}
