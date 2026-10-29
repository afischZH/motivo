import { HeartIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { compilePath } from "@/i18n/paths";

import { HeaderNav, type HeaderNavItem } from "./header-nav";
import { LogoMark } from "./logo-mark";

export function SiteHeader() {
  const locale = useLocale() as EnabledLocale;
  const t = useTranslations("Layout");
  const tFooter = useTranslations("Footer");
  const tConvert = useTranslations("Converters");
  const tPatterns = useTranslations("PatternLibrary");
  const tTheme = useTranslations("Theme");
  const tDesigns = useTranslations("Designs");
  const tBrand = useTranslations("BrandKit");

  const items: HeaderNavItem[] = [
    { href: compilePath("/tools", locale), label: t("toolsNav"), icon: "tools" },
    { href: compilePath("/css-patterns", locale), label: tPatterns("nav"), icon: "patterns" },
    { href: compilePath("/convert", locale), label: tConvert("nav"), icon: "convert" },
    {
      href: compilePath("/my-designs", locale),
      label: tDesigns("nav"),
      icon: "designs",
      iconInBar: true,
      testId: "my-designs-nav",
    },
    {
      href: compilePath("/brand-kit", locale),
      label: tBrand("nav"),
      icon: "brandKit",
      iconInBar: true,
      testId: "brand-kit-nav",
    },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          aria-label={t("homeLink")}
          className="flex shrink-0 items-center gap-2.5 rounded-control text-base font-semibold tracking-tight"
        >
          <LogoMark className="size-7" />
          {t("brand")}
        </Link>
        <div className="max-lg:order-last">
          <HeaderNav
            items={items}
            supportHref={compilePath("/support", locale)}
            labels={{
              nav: t("mainNav"),
              menu: t("menu"),
              close: t("closeMenu"),
              brand: t("brand"),
              support: tFooter("support"),
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 max-lg:ml-auto">
          <Link
            href="/support"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full max-lg:hidden",
            })}
          >
            <HeartIcon aria-hidden="true" className="text-link" />
            {t("supportCta")}
          </Link>
          {/* The visible hint uses the generic form; macOS users read ⌘ for Ctrl. */}
          <ThemeToggle label={tTheme("toggle")} hint={tTheme("hint", { shortcut: "⌘/Ctrl+⇧+K" })} />
        </div>
      </div>
    </header>
  );
}
