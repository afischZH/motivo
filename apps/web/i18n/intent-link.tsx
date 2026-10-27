"use client";

import NextLink from "next/link";
import {
  type ComponentProps,
  type FocusEvent,
  type PointerEvent,
  type TouchEvent,
  useState,
} from "react";

import { type PrefetchProp, prefetchMode } from "@/lib/prefetch";

interface IntentHandlers<E extends Element> {
  prefetch?: PrefetchProp;
  onPointerEnter?: ((event: PointerEvent<E>) => void) | undefined;
  onFocus?: ((event: FocusEvent<E>) => void) | undefined;
  onTouchStart?: ((event: TouchEvent<E>) => void) | undefined;
}

/**
 * Prefetching on intent instead of on visibility.
 *
 * Next prefetches every link in the viewport by default. On the landing
 * pages (dozens of tool cards) that meant a dozen RSC requests plus the
 * client chunks of the linked pages (editor, converters) right after load,
 * which Lighthouse counted as blocking time. Here prefetching starts once
 * the pointer enters the link, it gets focus or a touch begins, which is
 * still well before the click. An explicit `prefetch` prop always wins.
 */
export function useIntentPrefetch<E extends Element>({
  prefetch,
  onPointerEnter,
  onFocus,
  onTouchStart,
}: IntentHandlers<E>) {
  const [intent, setIntent] = useState(false);
  const show = () => {
    if (!intent) setIntent(true);
  };
  return {
    prefetch: prefetchMode(prefetch, intent),
    onPointerEnter: (event: PointerEvent<E>) => {
      show();
      onPointerEnter?.(event);
    },
    onFocus: (event: FocusEvent<E>) => {
      show();
      onFocus?.(event);
    },
    onTouchStart: (event: TouchEvent<E>) => {
      show();
      onTouchStart?.(event);
    },
  };
}

/**
 * `next/link` with an already localized `href` (resolved on the server by
 * `Link` in `navigation.tsx`). Needs no `NextIntlClientProvider`, so pages
 * without translated client components ship no message formatter.
 */
export function IntentLink({
  prefetch,
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof NextLink>) {
  const intent = useIntentPrefetch<HTMLAnchorElement>({
    prefetch,
    onPointerEnter,
    onFocus,
    onTouchStart,
  });
  return <NextLink {...props} {...intent} />;
}
