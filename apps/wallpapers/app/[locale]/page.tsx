import { DEVICE_GROUPS, DEVICES, devicesInGroup } from "@musterli/devices";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EditorLoader } from "@/components/editor-loader";
import { routing } from "@/i18n/routing";
import { devicePath } from "@/lib/device-pages";
import { editorLabels } from "@/lib/editor-labels";
import { formatSize } from "@/lib/format";

type HomeProps = Readonly<{ params: Promise<{ locale: string }> }>;

export default async function Home({ params }: HomeProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Home" });
  const e = await getTranslations({ locale, namespace: "Editor" });
  const labels = await editorLabels(locale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <section aria-labelledby="home-title" className="max-w-2xl">
        <h1
          id="home-title"
          className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {t("title")}
        </h1>
        <p className="text-muted mt-4 text-lg text-pretty">{t("lead")}</p>
      </section>

      <section aria-label={e("heading")} className="mt-10">
        <EditorLoader locale={locale} labels={labels} loading={e("loading")} />
      </section>

      <section aria-labelledby="catalog-title" className="mt-14">
        <h2 id="catalog-title" className="text-xl font-semibold">
          {t("catalogHeading")}
        </h2>
        <p className="text-muted mt-1">{t("catalogLead", { count: DEVICES.length })}</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DEVICE_GROUPS.map((group) => (
            <section
              key={group}
              aria-labelledby={`group-${group}`}
              className="border-border bg-surface rounded-[14px] border p-4"
            >
              <h3 id={`group-${group}`} className="font-medium">
                {t(`groups.${group}`)}
              </h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {devicesInGroup(group).map((device) => (
                  <li key={device.id} className="flex justify-between gap-3">
                    <Link
                      href={devicePath(locale, device.id)}
                      className="hover:text-accent-text underline-offset-4 hover:underline"
                    >
                      {device.name}
                    </Link>
                    <span className="text-muted shrink-0 tabular-nums">
                      {formatSize(device.width, device.height, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
