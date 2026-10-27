import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <Link href="/" className="rounded-control text-link underline underline-offset-4">
        {t("home")}
      </Link>
    </div>
  );
}
