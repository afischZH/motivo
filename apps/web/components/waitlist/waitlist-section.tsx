/**
 * Founders waitlist block for the home page and the Founders page: heading,
 * non-binding "from" price, and the client form (counter and sign-up when
 * the API says the waitlist is on, "coming soon" otherwise).
 *
 * JURISTISCH ZU PRÜFEN: price wording and waitlist texts (`Waitlist`).
 */
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { WAITLIST_CLIENT_NAMESPACES, pickMessages } from "@/lib/client-messages";
import { telemetryEnv, turnstileSiteKey } from "@/lib/telemetry/config";
import { FOUNDERS_PRICE_FROM, FOUNDERS_SEATS } from "@/lib/waitlist/constants";

import { WaitlistForm } from "./waitlist-form";

export const WAITLIST_SECTION_ID = "founders-waitlist";

export async function WaitlistSection({
  locale,
  headingLevel = 2,
  showMoreLink = false,
}: {
  locale: EnabledLocale;
  headingLevel?: 2 | 3;
  showMoreLink?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "Waitlist" });
  const messages = pickMessages(await getMessages({ locale }), WAITLIST_CLIENT_NAMESPACES);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  // Public site key from the build; null keeps the form without a challenge.
  const siteKey = turnstileSiteKey(telemetryEnv());

  return (
    <section
      id={WAITLIST_SECTION_ID}
      aria-labelledby={`${WAITLIST_SECTION_ID}-heading`}
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4"
    >
      <div className="grid gap-8 rounded-card border border-border bg-card p-6 sm:p-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-link">{t("eyebrow")}</p>
          <Heading
            id={`${WAITLIST_SECTION_ID}-heading`}
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {t("heading")}
          </Heading>
          <p className="text-muted-foreground">{t("lead", { seats: FOUNDERS_SEATS })}</p>
          <p className="text-lg font-semibold" data-testid="waitlist-price">
            {t("price", { price: FOUNDERS_PRICE_FROM })}
          </p>
          <p className="text-sm text-muted-foreground">{t("priceNote")}</p>
          {showMoreLink && (
            <Link
              href="/founders"
              className="w-fit rounded-control text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              {t("learnMore")}
            </Link>
          )}
        </div>
        <div className="flex flex-col justify-center">
          <NextIntlClientProvider messages={messages}>
            <WaitlistForm siteKey={siteKey} />
          </NextIntlClientProvider>
          <noscript>
            <p className="text-sm text-muted-foreground">{t("noscript")}</p>
          </noscript>
        </div>
      </div>
    </section>
  );
}
