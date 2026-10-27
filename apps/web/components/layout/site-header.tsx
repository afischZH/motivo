import { useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Link } from "@/i18n/navigation";

export function SiteHeader() {
  const t = useTranslations("Layout");
  const tConvert = useTranslations("Converters");
  const tPatterns = useTranslations("PatternLibrary");

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          aria-label={t("homeLink")}
          className="rounded-control text-base font-semibold tracking-tight"
        >
          {t("brand")}
        </Link>
        <div className="flex items-center gap-4">
          <nav aria-label={t("mainNav")} className="flex items-center gap-4">
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
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
