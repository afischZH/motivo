import { HeartIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

import { LocaleSwitcher, type LocaleSwitcherLabels } from "./locale-switcher";
import { LogoMark } from "./logo-mark";

const LINK_CLASS =
  "rounded-control text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline";

type FooterHref =
  | "/tools"
  | "/css-patterns"
  | "/convert"
  | "/gradients"
  | "/palettes"
  | "/imprint"
  | "/privacy"
  | "/terms";

/** Site footer, laid out after the shadcnspace block footer-01. */
export function SiteFooter() {
  const t = useTranslations("Layout");
  const tFooter = useTranslations("Footer");

  const columns: { heading: string; links: { href: FooterHref; label: string }[] }[] = [
    {
      heading: tFooter("productHeading"),
      links: [
        { href: "/tools", label: tFooter("catalogue") },
        { href: "/css-patterns", label: tFooter("cssPatterns") },
        { href: "/convert", label: tFooter("converters") },
      ],
    },
    {
      heading: tFooter("collectionsHeading"),
      links: [
        { href: "/gradients", label: tFooter("gradients") },
        { href: "/palettes", label: tFooter("palettes") },
      ],
    },
    {
      heading: tFooter("legalHeading"),
      links: [
        { href: "/imprint", label: tFooter("imprint") },
        { href: "/privacy", label: tFooter("privacy") },
        { href: "/terms", label: tFooter("terms") },
      ],
    },
  ];

  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 text-sm sm:px-6">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex flex-col items-start gap-4">
            <Link
              href="/"
              aria-label={t("homeLink")}
              className="flex items-center gap-2.5 rounded-control text-base font-semibold tracking-tight"
            >
              <LogoMark className="size-7" />
              {t("brand")}
            </Link>
            <p className="max-w-[34ch] text-pretty text-muted-foreground">{t("footerTagline")}</p>
            <Link
              href="/support"
              className="inline-flex items-center gap-2 rounded-control font-medium text-foreground underline-offset-4 hover:underline"
            >
              <HeartIcon aria-hidden="true" className="size-4 text-link" />
              {tFooter("support")}
            </Link>
          </div>
          <nav
            aria-label={tFooter("nav")}
            className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-3"
          >
            {columns.map((column) => (
              <div key={column.heading} className="flex flex-col gap-3">
                <h2 className="font-medium text-foreground">{column.heading}</h2>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className={LINK_CLASS}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <Separator />
        <div className="flex flex-col-reverse gap-4 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{tFooter("copyright", { year: new Date().getFullYear() })}</p>
          <LocaleSwitcher
            labels={{
              nav: t("languageNav"),
              languages: Object.fromEntries(
                routing.locales.map((locale) => [locale, t(`languages.${locale}`)]),
              ) as LocaleSwitcherLabels["languages"],
            }}
          />
        </div>
      </div>
    </footer>
  );
}
