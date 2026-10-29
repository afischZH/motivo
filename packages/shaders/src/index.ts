/**
 * Shaders (docs/ARCHITECTURE.md 4.15): GLSL sources as strings, uniform
 * packing, palette textures, tile math and CPU references. Pure and free
 * of browser APIs; the WebGL2 runtime is `@musterli/shaders/runtime`.
 */
export * from "./uniforms";
export * from "./palette";
export * from "./tiles";
export * from "./frame";
export * from "./build-errors";
export * from "./noise";
export { GLSL_NOISE, GLSL_PRELUDE } from "./glsl/common";
export * from "./shader-gradient/uniforms";
export { SHADER_GRADIENT_FRAGMENT } from "./shader-gradient/fragment";
export { renderShaderGradientCpu } from "./shader-gradient/cpu";
