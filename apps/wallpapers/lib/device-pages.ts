import { DEVICES } from "@musterli/devices";

import { routing } from "@/i18n/routing";

/**
 * One static page per catalog device (T2): the editor starts on that device,
 * the text names its native size. Paths use the stable catalog id, e.g.
 * `/en/devices/iphone-6-3`, the same id share links carry in `t=`.
 */
export function devicePath(locale: string, id: string): string {
  return `/${locale}/devices/${id}`;
}

export function deviceStaticParams(): { locale: string; id: string }[] {
  return routing.locales.flatMap((locale) => DEVICES.map((device) => ({ locale, id: device.id })));
}

/** Public origin for absolute URLs (sitemap); the workers.dev host until a domain is chosen. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://wallpapers-web.andreas-65d.workers.dev"
).replace(/\/$/, "");
