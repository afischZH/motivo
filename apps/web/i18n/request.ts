import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing, type AppLocale } from "./routing";

/** Texts owned by workspace packages, merged under their own top-level namespace. */
const packageMessages: Record<AppLocale, () => Promise<{ default: object }>> = {
  de: () => import("@motivo/editor-ui/messages/de.json"),
  en: () => import("@motivo/editor-ui/messages/en.json"),
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const [app, editor] = await Promise.all([
    import(`../messages/${locale}.json`),
    packageMessages[locale](),
  ]);

  return {
    locale,
    messages: { ...app.default, ...editor.default },
  };
});
