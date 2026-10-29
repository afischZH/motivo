/**
 * Files of the self-hosted library fonts (`LIBRARY_FONTS` of
 * `@musterli/scene`), served from `public/fonts/<id>/` (same origin, so the
 * CSP's `font-src 'self'` covers them). One WOFF2 per weight and subset;
 * the subsets carry Google Fonts' `latin` and `latin-ext` ranges, so the
 * browser fetches latin-ext only for text that needs it. Built by
 * `assets/fonts/build-fonts.py`; `font-files.test.ts` checks that every file
 * exists.
 */
import type { LibraryFont } from "@musterli/scene";

export const FONT_SUBSETS = {
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  "latin-ext":
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
} as const;
export type FontSubset = keyof typeof FONT_SUBSETS;

export interface FontFile {
  weight: number;
  subset: FontSubset;
  /** Path below the site root. */
  url: string;
}

export function fontFileUrl(id: string, weight: number, subset: FontSubset): string {
  return `/fonts/${id}/${id}-${weight}-${subset}.woff2`;
}

/** Every file of a library font. */
export function fontFiles(font: LibraryFont): FontFile[] {
  return font.weights.flatMap((weight) =>
    (Object.keys(FONT_SUBSETS) as FontSubset[]).map((subset) => ({
      weight,
      subset,
      url: fontFileUrl(font.id, weight, subset),
    })),
  );
}
