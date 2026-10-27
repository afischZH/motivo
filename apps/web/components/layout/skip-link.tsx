import { useTranslations } from "next-intl";

export const MAIN_CONTENT_ID = "main-content";

export function SkipLink() {
  const t = useTranslations("Layout");

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      {t("skipToContent")}
    </a>
  );
}
