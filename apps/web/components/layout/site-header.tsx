import { useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Link } from "@/i18n/navigation";

export function SiteHeader() {
  const t = useTranslations("Layout");
  const tConvert = useTranslations("Converters");
  const tPatterns = useTranslations("PatternLibrary");
  const tTheme = useTranslations("Theme");
  const tDesigns = useTranslations("Designs");
  const tBrand = useTranslations("BrandKit");

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4">
        <Link
          href="/"
          aria-label={t("homeLink")}
          className="shrink-0 rounded-control text-base font-semibold tracking-tight"
        >
          {t("brand")}
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <nav aria-label={t("mainNav")} className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/tools"
              className="rounded-control text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("toolsNav")}
            </Link>
            <Link
              href="/css-patterns"
              className="rounded-control text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {tPatterns("nav")}
            </Link>
            <Link
              href="/convert"
              className="rounded-control text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {tConvert("nav")}
            </Link>
            {/* Subtle: icon only on narrow screens, the name from sm up. */}
            <Link
              href="/my-designs"
              className="inline-flex items-center gap-1.5 rounded-control text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              data-testid="my-designs-nav"
            >
              <svg
                className="size-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <span className="sr-only sm:not-sr-only">{tDesigns("nav")}</span>
            </Link>
            <Link
              href="/brand-kit"
              className="inline-flex items-center gap-1.5 rounded-control text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              data-testid="brand-kit-nav"
            >
              <svg
                className="size-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="13.5" cy="6.5" r="1.5" />
                <circle cx="17.5" cy="10.5" r="1.5" />
                <circle cx="8.5" cy="7.5" r="1.5" />
                <circle cx="6.5" cy="12.5" r="1.5" />
                <path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.7 5.7 0 0 0 22 9.7C22 5.4 17.5 2 12 2Z" />
              </svg>
              <span className="sr-only sm:not-sr-only">{tBrand("nav")}</span>
            </Link>
          </nav>
          {/* The visible hint uses the generic form; macOS users read ⌘ for Ctrl. */}
          <ThemeToggle label={tTheme("toggle")} hint={tTheme("hint", { shortcut: "⌘/Ctrl+⇧+K" })} />
        </div>
      </div>
    </header>
  );
}
