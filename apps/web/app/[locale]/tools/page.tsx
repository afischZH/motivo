import { Motif, renderMotif } from "@motivo/editor-ui";
import { DEFAULT_CANVAS_SIZE, registry } from "@motivo/tool-registry";
import type { Metadata } from "next";
import { hasLocale, useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { use } from "react";

import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type ToolsPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

/** Longest edge of the card previews in CSS pixels. */
const CARD_PREVIEW_EDGE = 160;

export async function generateMetadata({ params }: ToolsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "ToolsIndex" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function ToolsPage({ params }: ToolsPageProps) {
  const { locale } = use(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = useTranslations();
  // Tool keys are built from the id, which the typed message keys cannot know.
  const toolText = t as unknown as (key: string) => string;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t("ToolsIndex.title")}</h1>
        <p className="max-w-prose text-muted-foreground">{t("ToolsIndex.lead")}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {registry.list().map((tool) => {
          const size = tool.defaultSize ?? DEFAULT_CANVAS_SIZE;
          // Same render path as the editor, with the tool's defaults and seed 1.
          const output = renderMotif(tool, tool.defaults, 1, size);
          const name = toolText(`tools.${tool.id}.name`);
          return (
            <li key={tool.id}>
              <Link
                href={`/tools/${tool.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground transition-colors hover:border-ring"
              >
                <div className="flex h-44 items-center justify-center bg-canvas" aria-hidden="true">
                  <Motif
                    output={output}
                    width={size.width}
                    height={size.height}
                    scale={CARD_PREVIEW_EDGE / Math.max(size.width, size.height)}
                    className="rounded-md shadow-sm"
                  />
                </div>
                <div className="flex flex-col gap-1 p-4">
                  <h2 className="text-base font-semibold">{name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {toolText(`tools.${tool.id}.description`)}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
