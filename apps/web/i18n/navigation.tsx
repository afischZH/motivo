/**
 * Localized `Link` for server components. It resolves the localized href on
 * the server (`compilePath`, same result as next-intl's `getPathname`) and
 * renders a plain `next/link` that prefetches on intent (`intent-link.tsx`).
 * Nothing here references next-intl's navigation, so pages whose client
 * components need no translations load no next-intl client code at all.
 * Client components import from `client-navigation.ts` instead; importing
 * this module from a client component fails the build (async component).
 */
import { getLocale } from "next-intl/server";
import type { ComponentProps } from "react";

import { IntentLink } from "./intent-link";
import type { EnabledLocale } from "./locales";
import { compilePath, type RouteHref } from "./paths";

type LinkProps = Omit<ComponentProps<typeof IntentLink>, "href"> & {
  /** Internal pathname, as for next-intl's `Link` (e.g. from `routeHref`). */
  href: RouteHref;
  /** Target language; default: the current one. */
  locale?: EnabledLocale;
};

export async function Link({ href, locale, ...props }: LinkProps) {
  const current = (await getLocale()) as EnabledLocale;
  const target = locale ?? current;
  // Like next-intl's Link: mark links into another language.
  const lang = target !== current ? { hrefLang: target } : {};
  return <IntentLink {...props} {...lang} href={compilePath(href, target)} />;
}
