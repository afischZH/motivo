/** Values of the `prefetch` prop of `next/link` in the App Router. */
export type PrefetchProp = boolean | "auto" | null | undefined;

/**
 * Prefetch setting for an intent-based link (`i18n/intent-link.tsx`): an
 * explicit value wins; otherwise nothing is prefetched until the user shows
 * intent, then Next's default (`null`) applies, which prefetches at once
 * because the link is visible.
 */
export function prefetchMode(
  explicit: PrefetchProp,
  intent: boolean,
): Exclude<PrefetchProp, undefined> {
  if (explicit !== undefined) return explicit;
  return intent ? null : false;
}
