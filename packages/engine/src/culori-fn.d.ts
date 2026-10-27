/**
 * Minimal type declarations for the tree-shakable `culori/fn` entry point.
 * culori ships no types; this covers only the functions the engine imports,
 * so we do not need `@types/culori` as an extra dependency.
 */
declare module "culori/fn" {
  export interface CuloriRgb {
    mode: string;
    r: number;
    g: number;
    b: number;
    alpha?: number;
  }

  export interface CuloriLab {
    mode: string;
    l: number;
    a: number;
    b: number;
    alpha?: number;
  }

  export interface CuloriLch {
    mode: string;
    l: number;
    c: number;
    /** Undefined for achromatic colours. */
    h?: number;
    alpha?: number;
  }

  /** Parses `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa`; undefined if invalid. */
  export function parseHex(color: string): CuloriRgb | undefined;
  export function convertRgbToOklab(color: Omit<CuloriRgb, "mode">): CuloriLab;
  export function convertOklabToRgb(color: Omit<CuloriLab, "mode">): CuloriRgb;
  export function convertLabToLch(color: Omit<CuloriLab, "mode">, mode?: string): CuloriLch;
  export function convertLchToLab(color: Omit<CuloriLch, "mode">, mode?: string): CuloriLab;
}
