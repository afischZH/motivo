/**
 * Render-ready SVG uploads (`ImageAsset` of kind `svg`) without sanitising
 * on the main thread.
 *
 * Tools sanitise an SVG upload again before every use and need one
 * recoloured copy per motif colour. Each of those is a full sanitizer pass
 * (about 50 to 100 ms for a 1 MB file), too slow for the main thread. So the
 * editor prepares an upload once, in its sanitize worker, with
 * `prepareSvgAsset`, and hands the result to `primeSvgAsset`. Renderers then
 * call `svgAssetFor` (a cache hit) and `recolorSvgAsset` (a string join).
 *
 * `prepareSvgAsset` only runs the unchanged sanitizer:
 *  - `check` is `sanitizeSvg(input)`, the defence-in-depth pass;
 *  - the recolour template comes from two recoloured passes with the colours
 *    #000000 and #ffffff. Both outputs have the same length and differ only
 *    in the six hex digits of each recoloured value, so splitting at those
 *    runs and joining with another colour gives exactly what
 *    `sanitizeSvg(input, { recolor })` returns (unit-tested against it).
 *
 * Input that was never primed (another realm, an evicted entry) is prepared
 * here on demand: still correct, just slower. Pure and DOM-free; safe in
 * workers and on the server.
 */
import { sanitizeSvg, type SvgRect } from "@musterli/svg-sanitizer";

export interface PreparedSvgAsset {
  /** The input this entry is for (sanitizer output: canonical). */
  input: string;
  /** `sanitizeSvg(input).svg`; equal to `input` for sanitizer output. */
  svg: string;
  width: number;
  height: number;
  viewBox: SvgRect;
  /**
   * `sanitizeSvg(input, { recolor })` is `parts.join(hexDigits)`; `null` if
   * the template could not be verified (recolouring then runs the sanitizer).
   */
  recolorParts: string[] | null;
}

const DARK = "#000000";
const LIGHT = "#ffffff";
const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

/** Splits `dark` at the hex digits where it differs from `light`; `null` if anything is off. */
function recolorTemplate(dark: string, light: string): string[] | null {
  if (dark.length !== light.length) return null;
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  while (i < dark.length) {
    if (dark.charCodeAt(i) === light.charCodeAt(i)) {
      i++;
      continue;
    }
    // Every recoloured value is "#000000" in one and "#ffffff" in the other.
    if (
      dark[i - 1] !== "#" ||
      dark.slice(i, i + 6) !== "000000" ||
      light.slice(i, i + 6) !== "ffffff" ||
      dark[i + 6] !== '"'
    ) {
      return null;
    }
    parts.push(dark.slice(start, i));
    i += 6;
    start = i;
  }
  parts.push(dark.slice(start));
  return parts;
}

/**
 * Runs the sanitizer on `input` (check plus recolour template). `null` if
 * the sanitizer rejects it. Expensive: call in a worker.
 */
export function prepareSvgAsset(input: string): PreparedSvgAsset | null {
  const check = sanitizeSvg(input);
  if (!check.ok) return null;
  const dark = sanitizeSvg(input, { recolor: DARK });
  const light = sanitizeSvg(input, { recolor: LIGHT });
  const recolorParts = dark.ok && light.ok ? recolorTemplate(dark.svg, light.svg) : null;
  return {
    input,
    svg: check.svg,
    width: check.width,
    height: check.height,
    viewBox: check.viewBox,
    recolorParts,
  };
}

/** Entries kept (current upload, undo history, a few variants). */
const CACHE_ENTRIES = 4;
const cache = new Map<string, PreparedSvgAsset>();

function remember(entry: PreparedSvgAsset): void {
  cache.delete(entry.input);
  if (cache.size >= CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(entry.input, entry);
}

/**
 * Stores a result of `prepareSvgAsset` computed elsewhere (the editor's
 * sanitize worker). Only canonical sanitizer output is accepted
 * (`svg === input`); anything else is prepared again on use.
 */
export function primeSvgAsset(entry: PreparedSvgAsset): boolean {
  if (typeof entry.input !== "string" || entry.svg !== entry.input) return false;
  remember(entry);
  return true;
}

/** The prepared form of `input`: cached, otherwise prepared now (slow for large input). */
export function svgAssetFor(input: string): PreparedSvgAsset | null {
  const hit = cache.get(input);
  if (hit) return hit;
  const prepared = prepareSvgAsset(input);
  if (prepared) remember(prepared);
  return prepared;
}

/** `sanitizeSvg(asset.input, { recolor: color }).svg`, usually without a sanitizer pass. */
export function recolorSvgAsset(asset: PreparedSvgAsset, color: string): string | null {
  if (!HEX.test(color)) return null;
  if (asset.recolorParts) return asset.recolorParts.join(color.slice(1).toLowerCase());
  const result = sanitizeSvg(asset.input, { recolor: color });
  return result.ok ? result.svg : null;
}

/** Test helper: forgets all prepared entries. */
export function clearSvgAssetCache(): void {
  cache.clear();
}
