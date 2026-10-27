/**
 * CSP hashes of inline scripts. Build and test only (node:crypto).
 */
import { createHash } from "node:crypto";

import { themeInitScript } from "./theme";

/** CSP hash source (`'sha256-…'`) of an inline script, exactly as rendered. */
export function cspHash(source: string): string {
  return `'sha256-${createHash("sha256").update(source, "utf8").digest("base64")}'`;
}

/**
 * Hash of the no-flash theme script in the locale layout, derived from the
 * same string the layout renders, so it cannot drift.
 *
 * Not part of the enforced policy yet: statically prerendered App Router pages
 * also carry page-specific inline scripts (Turbopack bootstrap, React flight
 * data `self.__next_f.push(…)`) that only nonces could cover, and nonces force
 * dynamic rendering. Browsers ignore `'unsafe-inline'` as soon as a hash is
 * listed, so adding this hash today would block those scripts and break
 * hydration. Ready for the switch once Next can hash its static inline scripts.
 */
export const THEME_SCRIPT_HASH = cspHash(themeInitScript);
