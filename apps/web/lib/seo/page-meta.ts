import type { Metadata } from "next";

import type { EnabledLocale } from "@/i18n/locales";
import { routePath, type AppRoute } from "@/i18n/paths";

import { OG_SIZE, ogImagePath } from "./og";
import { siteUrl } from "./site-url";

/** Currency of the free offer in structured data (price 0). */
export const SCHEMA_CURRENCY = "CHF";

/** Open Graph `og:locale` per locale. */
const OG_LOCALE: Record<EnabledLocale, string> = { de: "de_CH", en: "en_US" };

/** Absolute URL of a tool's OG image (built by `scripts/og-images.mjs`). */
export function ogImageUrl(toolId: string, locale: EnabledLocale): string {
  return new URL(ogImagePath(toolId, locale), siteUrl()).toString();
}

/** Open Graph data of a page, with the tool's OG image when there is one. */
export function pageOpenGraph({
  route,
  locale,
  siteName,
  title,
  description,
  image,
}: {
  route: AppRoute;
  locale: EnabledLocale;
  siteName: string;
  title: string;
  description: string;
  image?: { toolId: string; alt: string } | undefined;
}): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    siteName,
    title,
    description,
    url: new URL(routePath(route, locale), siteUrl()).toString(),
    locale: OG_LOCALE[locale],
    ...(image
      ? {
          images: [
            {
              url: ogImageUrl(image.toolId, locale),
              ...OG_SIZE,
              alt: image.alt,
              type: "image/png",
            },
          ],
        }
      : {}),
  };
}
