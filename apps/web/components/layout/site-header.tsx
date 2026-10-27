import { useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Link } from "@/i18n/navigation";

export function SiteHeader() {
  const t = useTranslations("Layout");

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
        <ThemeToggle />
      </div>
    </header>
  );
}
