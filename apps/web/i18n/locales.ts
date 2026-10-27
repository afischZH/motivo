/**
 * Locale configuration. `ALL_LOCALES` lists every language the slug model
 * knows about; only `ENABLED_LOCALES` are routed, get messages and appear in
 * hreflang links. Enabling FR or IT later = move it to `ENABLED_LOCALES`,
 * add `messages/<locale>.json` and fill in its slugs (the contract test in
 * `slugs.test.ts` then requires them).
 */
export const ALL_LOCALES = ["de", "en", "fr", "it"] as const;
export const ENABLED_LOCALES = ["de", "en"] as const satisfies readonly AnyLocale[];
export const DEFAULT_LOCALE = "de" satisfies EnabledLocale;

export type AnyLocale = (typeof ALL_LOCALES)[number];
export type EnabledLocale = (typeof ENABLED_LOCALES)[number];

/** Prepared but not yet routed: may omit slugs, falling back to English. */
export type PreparedLocale = Exclude<AnyLocale, EnabledLocale>;

/** Slugs per locale: required for enabled locales, optional for prepared ones. */
export type LocalizedSlugs = Record<EnabledLocale, string> &
  Partial<Record<PreparedLocale, string>>;

/** Locale whose slug a prepared locale borrows until it has its own. */
export const SLUG_FALLBACK_LOCALE = "en" satisfies EnabledLocale;

export function isEnabledLocale(value: string): value is EnabledLocale {
  return (ENABLED_LOCALES as readonly string[]).includes(value);
}
