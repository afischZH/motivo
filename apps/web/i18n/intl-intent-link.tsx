"use client";

import type { ComponentProps } from "react";

import { useIntentPrefetch } from "./intent-link";
import { Link as IntlLink } from "./navigation-base";

/**
 * The localized next-intl `Link` for client components (inside a
 * `NextIntlClientProvider`), prefetching on intent like `IntentLink`. Kept
 * apart so pages that only use `IntentLink` do not load next-intl's client.
 */
export function Link({
  prefetch,
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof IntlLink>) {
  const intent = useIntentPrefetch<HTMLAnchorElement>({
    prefetch,
    onPointerEnter,
    onFocus,
    onTouchStart,
  });
  return <IntlLink {...props} {...intent} />;
}
