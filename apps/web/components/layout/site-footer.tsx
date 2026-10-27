import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "./locale-switcher";

export function SiteFooter() {
  const t = useTranslations("Layout");

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{t("footerTagline")}</p>
        <LocaleSwitcher />
      </div>
    </footer>
  );
}
