import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <div className="mx-auto max-w-5xl px-4 py-24">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Link
        href="/"
        className="text-accent-text mt-4 inline-block underline-offset-4 hover:underline"
      >
        {t("back")}
      </Link>
    </div>
  );
}
