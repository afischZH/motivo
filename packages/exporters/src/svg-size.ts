/**
 * Pure helper to rasterise an SVG at any pixel size: set the root's
 * `width`/`height` to the output size and keep (or add) the `viewBox`, so the
 * browser rasterises the vector at full resolution instead of upscaling.
 */
import { ExportError } from "./errors";

const ROOT = /^(\s*(?:<\?xml[^>]*\?>\s*)?<svg\b)([^>]*?)(\/?>)/;
const attr = (name: string): RegExp => new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`);

/** Reads `width`/`height`/`viewBox` of the root `<svg>`; `undefined` if absent or not numeric. */
export function readSvgSize(svg: string): { width?: number; height?: number; viewBox?: string } {
  const root = ROOT.exec(svg);
  if (!root) return {};
  const attrs = root[2] ?? "";
  const num = (name: string): number | undefined => {
    const v = attr(name).exec(attrs)?.[2];
    if (v === undefined || !/^\s*[\d.]+(?:px)?\s*$/.test(v)) return undefined;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const out: { width?: number; height?: number; viewBox?: string } = {};
  const width = num("width");
  const height = num("height");
  const viewBox = attr("viewBox").exec(attrs)?.[2];
  if (width !== undefined) out.width = width;
  if (height !== undefined) out.height = height;
  if (viewBox !== undefined) out.viewBox = viewBox;
  return out;
}

/**
 * Returns the SVG with its root sized `width` x `height` pixels. Adds a
 * `viewBox` from the original size if missing. Throws
 * `ExportError("decode-failed")` if there is no root `<svg>` or no way to
 * know its coordinate system.
 */
export function resizeSvg(svg: string, width: number, height: number): string {
  const root = ROOT.exec(svg);
  if (!root) throw new ExportError("decode-failed", "No root <svg> element");
  const [whole, open, rawAttrs = "", close] = root;
  const size = readSvgSize(svg);
  if (size.viewBox === undefined && (size.width === undefined || size.height === undefined)) {
    throw new ExportError("decode-failed", "SVG has neither viewBox nor numeric width/height");
  }
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  // Replace in place where present, so attribute order stays as generated.
  let attrs = rawAttrs;
  for (const [name, value] of [
    ["width", w],
    ["height", h],
  ] as const) {
    const re = attr(name);
    attrs = re.test(attrs)
      ? attrs.replace(re, ` ${name}="${value}"`)
      : `${attrs} ${name}="${value}"`;
  }
  if (size.viewBox === undefined) attrs += ` viewBox="0 0 ${size.width} ${size.height}"`;
  return `${open}${attrs}${close}${svg.slice(whole.length)}`;
}
