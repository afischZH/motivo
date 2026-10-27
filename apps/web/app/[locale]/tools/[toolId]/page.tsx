import { registry } from "@motivo/tool-registry";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { use } from "react";

import { ToolEditor } from "@/components/editor/tool-editor";
import { routing } from "@/i18n/routing";

type ToolPageProps = Readonly<{ params: Promise<{ locale: string; toolId: string }> }>;

/** Prerenders every registered tool; the parent layout supplies the locales. */
export function generateStaticParams() {
  return registry.list().map((tool) => ({ toolId: tool.id }));
}

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const { locale, toolId } = await params;
  if (!hasLocale(routing.locales, locale) || !registry.has(toolId)) return {};
  const t = await getTranslations({ locale });
  // Tool keys are built from the id, which the typed message keys cannot know.
  const tool = t as unknown as (key: string) => string;
  return {
    title: t("ToolPage.metaTitle", { tool: tool(`tools.${toolId}.name`) }),
    description: tool(`tools.${toolId}.description`),
  };
}

export default function ToolPage({ params }: ToolPageProps) {
  const { locale, toolId } = use(params);
  if (!hasLocale(routing.locales, locale) || !registry.has(toolId)) notFound();
  setRequestLocale(locale);

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <ToolEditor toolId={toolId} />
    </div>
  );
}
