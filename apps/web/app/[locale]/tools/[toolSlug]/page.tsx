import { registry } from "@motivo/tool-registry";
import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ToolEditor } from "@/components/editor/tool-editor";
import type { EnabledLocale } from "@/i18n/locales";
import { routing } from "@/i18n/routing";
import { editorMessages } from "@/lib/client-messages";
import { toolIdFromSlug, toolSlug } from "@/i18n/slugs";
import { pageAlternates } from "@/lib/seo/alternates";

type ToolPageProps = Readonly<{ params: Promise<{ locale: string; toolSlug: string }> }>;

/** Prerenders every registered tool under its slug in this locale. */
export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale as EnabledLocale;
  return registry.list().map((tool) => ({ toolSlug: toolSlug(tool.id, locale) }));
}

/** The registered tool behind this locale's slug. Old ids are redirected by the proxy. */
function resolveTool(locale: string, slug: string): string | undefined {
  if (!hasLocale(routing.locales, locale)) return undefined;
  const toolId = toolIdFromSlug(slug, locale) ?? slug;
  return registry.has(toolId) && toolSlug(toolId, locale) === slug ? toolId : undefined;
}

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const { locale, toolSlug: slug } = await params;
  const toolId = resolveTool(locale, slug);
  if (!toolId || !hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // Tool keys are built from the id, which the typed message keys cannot know.
  const tool = t as unknown as (key: string) => string;
  return {
    title: t("ToolPage.metaTitle", { tool: tool(`tools.${toolId}.name`) }),
    description: tool(`tools.${toolId}.description`),
    alternates: pageAlternates({ page: "tool", toolId }, locale),
  };
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { locale, toolSlug: slug } = await params;
  const toolId = resolveTool(locale, slug);
  if (!toolId || !hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <NextIntlClientProvider messages={editorMessages(await getMessages())}>
        <ToolEditor toolId={toolId} />
      </NextIntlClientProvider>
    </div>
  );
}
