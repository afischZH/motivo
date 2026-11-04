import { devicesInGroup, getDevice } from "@musterli/devices";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EditorLoader } from "@/components/editor-loader";
import { routing } from "@/i18n/routing";
import { devicePath, deviceStaticParams } from "@/lib/device-pages";
import { editorLabels } from "@/lib/editor-labels";
import { formatSize } from "@/lib/format";

type DevicePageProps = Readonly<{ params: Promise<{ locale: string; id: string }> }>;

// Every catalog device is known at build time; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return deviceStaticParams();
}

export async function generateMetadata({ params }: DevicePageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const device = getDevice(id);
  if (!hasLocale(routing.locales, locale) || !device) return {};
  const t = await getTranslations({ locale, namespace: "Device" });
  const values = { device: device.name, size: formatSize(device.width, device.height, locale) };
  return {
    title: t("metaTitle", values),
    description: t("metaDescription", values),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((code) => [code, devicePath(code, device.id)]),
      ),
    },
  };
}

export default async function DevicePage({ params }: DevicePageProps) {
  const { locale, id } = await params;
  const device = getDevice(id);
  if (!hasLocale(routing.locales, locale) || !device) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Device" });
  const h = await getTranslations({ locale, namespace: "Home" });
  const e = await getTranslations({ locale, namespace: "Editor" });
  const labels = await editorLabels(locale);
  const size = formatSize(device.width, device.height, locale);
  const siblings = devicesInGroup(device.group).filter((other) => other.id !== device.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <nav aria-label={t("allDevices")} className="text-sm">
        <Link href={`/${locale}`} className="text-accent-text underline-offset-4 hover:underline">
          {t("allDevices")}
        </Link>
      </nav>
      <section aria-labelledby="device-title" className="mt-4 max-w-2xl">
        <h1
          id="device-title"
          className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {t("title", { device: device.name })}
        </h1>
        <p className="text-muted mt-4 text-lg text-pretty">
          {t("lead", { device: device.name, size })}
        </p>
      </section>

      <section aria-label={e("heading")} className="mt-10">
        <EditorLoader
          locale={locale}
          labels={labels}
          loading={e("loading")}
          initialDeviceId={device.id}
        />
      </section>

      {siblings.length > 0 ? (
        <section aria-labelledby="siblings-title" className="mt-14">
          <h2 id="siblings-title" className="text-xl font-semibold">
            {t("otherDevices", { group: h(`groups.${device.group}`) })}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm">
            {siblings.map((other) => (
              <li key={other.id}>
                <Link
                  href={devicePath(locale, other.id)}
                  className="border-border hover:bg-surface inline-flex rounded-full border px-3 py-1.5"
                >
                  {other.name}
                  <span className="text-muted ml-2 tabular-nums">
                    {formatSize(other.width, other.height, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
