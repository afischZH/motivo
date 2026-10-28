import { useLocale, useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { compilePath } from "@/i18n/paths";

import { HeaderNav, type HeaderNavItem } from "./header-nav";

export function SiteHeader() {
  const locale = useLocale() as EnabledLocale;
  const t = useTranslations("Layout");
  const tConvert = useTranslations("Converters");
  const tPatterns = useTranslations("PatternLibrary");
  const tTheme = useTranslations("Theme");
  const tDesigns = useTranslations("Designs");
  const tBrand = useTranslations("BrandKit");

  const items: HeaderNavItem[] = [
    { href: compilePath("/tools", locale), label: t("toolsNav") },
    { href: compilePath("/css-patterns", locale), label: tPatterns("nav") },
    { href: compilePath("/convert", locale), label: tConvert("nav") },
    {
      href: compilePath("/my-designs", locale),
      label: tDesigns("nav"),
      icon: "designs",
      testId: "my-designs-nav",
    },
    {
      href: compilePath("/brand-kit", locale),
      label: tBrand("nav"),
      icon: "brandKit",
      testId: "brand-kit-nav",
    },
  ];

  return (
    <header className="relative z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4">
        <Link
          href="/"
          aria-label={t("homeLink")}
          className="shrink-0 rounded-control text-base font-semibold tracking-tight"
        >
          {t("brand")}
        </Link>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <HeaderNav items={items} labels={{ nav: t("mainNav"), menu: t("menu") }} />
          {/* The visible hint uses the generic form; macOS users read ⌘ for Ctrl. */}
          <ThemeToggle label={tTheme("toggle")} hint={tTheme("hint", { shortcut: "⌘/Ctrl+⇧+K" })} />
        </div>
      </div>
    </header>
  );
}
