import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import { LocaleSwitcher } from "./locale-switcher";

const LINK_CLASS =
  "rounded-control text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

export function SiteFooter() {
  const t = useTranslations("Layout");
  const tFooter = useTranslations("Footer");

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 text-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground">{t("footerTagline")}</p>
          <LocaleSwitcher />
        </div>
        <nav aria-label={tFooter("nav")} className="flex flex-wrap gap-x-12 gap-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-medium">{tFooter("productHeading")}</h2>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/tools" className={LINK_CLASS}>
                  {tFooter("catalogue")}
                </Link>
              </li>
              <li>
                <Link href="/convert" className={LINK_CLASS}>
                  {tFooter("converters")}
                </Link>
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="font-medium">{tFooter("legalHeading")}</h2>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/imprint" className={LINK_CLASS}>
                  {tFooter("imprint")}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={LINK_CLASS}>
                  {tFooter("privacy")}
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  );
}
