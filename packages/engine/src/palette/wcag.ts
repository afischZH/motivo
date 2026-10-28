/**
 * WCAG 2 success criteria for a colour pair and the nearest colour that
 * meets a target ratio (docs/TOOLS.md F6).
 *
 * Pass/fail always uses the exact ratio (WCAG does not round: 4.499:1 fails
 * AA); only the displayed value is rounded down (`formatRatio`).
 */
import { hexToOklch, oklchToHex } from "../color";
import { contrastRatio } from "./contrast";

/** The five WCAG 2 checks the contrast checker shows. */
export const WCAG_CHECKS = [
  { id: "normal-aa", min: 4.5 },
  { id: "normal-aaa", min: 7 },
  { id: "large-aa", min: 3 },
  { id: "large-aaa", min: 4.5 },
  { id: "ui-aa", min: 3 },
] as const;
export type WcagCheckId = (typeof WCAG_CHECKS)[number]["id"];

export interface WcagCheckResult {
  id: WcagCheckId;
  /** Minimum ratio of the criterion. */
  min: number;
  pass: boolean;
}

/** All five checks for a ratio, in `WCAG_CHECKS` order. */
export function wcagChecks(ratio: number): WcagCheckResult[] {
  return WCAG_CHECKS.map((c) => ({ id: c.id, min: c.min, pass: ratio >= c.min }));
}

/** What a sample is: running text, large text (headings) or a UI component / graphic. */
export const CONTRAST_SAMPLES = ["heading", "body", "ui"] as const;
export type ContrastSample = (typeof CONTRAST_SAMPLES)[number];

/**
 * Target ratios of a sample: body text 4.5 (AA) and 7 (AAA), large text
 * 3 and 4.5, UI components 3 (WCAG 1.4.11 has no AAA level).
 */
export function sampleTargets(sample: ContrastSample): { aa: number; aaa: number | null } {
  if (sample === "body") return { aa: 4.5, aaa: 7 };
  if (sample === "heading") return { aa: 3, aaa: 4.5 };
  return { aa: 3, aaa: null };
}

/** Binary search steps on OKLCH lightness: 2^-32 is far below one 8-bit step. */
const SEARCH_STEPS = 32;

/**
 * The colour closest to `color` in OKLCH lightness (same hue and chroma,
 * chroma reduced only where the gamut demands it) that reaches `target`
 * contrast against `against`. Searches lighter and darker by bisection and
 * keeps the smaller lightness change (ties go to the darker colour). Every
 * candidate is judged on its final hex value, so the result really passes.
 *
 * Returns `color` itself (normalised) when it already passes and `null`
 * when neither direction can reach the target.
 */
export function nearestPassingColor(color: string, against: string, target: number): string | null {
  const start = oklchToHex(hexToOklch(color));
  if (contrastRatio(color, against) >= target) return color.toLowerCase();
  const base = hexToOklch(start);
  const at = (l: number): string => oklchToHex({ l, c: base.c, h: base.h });
  const passes = (l: number): boolean => contrastRatio(at(l), against) >= target;

  const search = (end: number): { hex: string; delta: number } | null => {
    if (!passes(end)) return null;
    let fail = base.l;
    let pass = end;
    for (let i = 0; i < SEARCH_STEPS; i++) {
      const mid = (fail + pass) / 2;
      if (passes(mid)) pass = mid;
      else fail = mid;
    }
    return { hex: at(pass), delta: Math.abs(pass - base.l) };
  };

  const darker = search(0);
  const lighter = search(1);
  if (darker && lighter) return lighter.delta < darker.delta ? lighter.hex : darker.hex;
  return (darker ?? lighter)?.hex ?? null;
}
