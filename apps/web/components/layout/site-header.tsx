import { useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Link } from "@/i18n/navigation";

export function SiteHeader() {
  const t = useTranslations("Layout");
  const tConvert = useTranslations("Converters");
  const tPatterns = useTranslations("PatternLibrary");
  const tTheme = useTranslations("Theme");
  const tDesigns = useTranslations("Designs");

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4">
        <Link
          href="/"
          aria-label={t("homeLink")}
          className="rounded-control text-base font-semibold tracking-tight"
        >
          {t("brand")}
        </Link>
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <nav aria-label={t("mainNav")} className="flex items-center gap-3 sm:gap-4">
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
          </nav>
          {/* The visible hint uses the generic form; macOS users read ⌘ for Ctrl. */}
          <ThemeToggle label={tTheme("toggle")} hint={tTheme("hint", { shortcut: "⌘/Ctrl+⇧+K" })} />
        </div>
      </div>
    </header>
  );
}
