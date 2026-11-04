/**
 * Shrinks GLSL for embedding: drops comments, indentation and blank lines.
 * Line breaks stay (preprocessor lines such as `#version` need them), so
 * the compiler sees the same tokens and the picture does not change.
 */
export function minifyGlsl(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlocks
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
