/**
 * Task page (W1-AP04): `/de/tools/aufgabe/hero-hintergruende`,
 * `/en/tools/task/hero-backgrounds`. The tools for one job a web designer
 * has, across categories (`lib/tasks.ts`). Static, no client JS beyond the
 * favourite stars of the cards.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { ToolCard } from "@/components/seo/tool-card";
import { chipClass } from "@/components/ui/chip";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { taskIdFromSlug, taskSlug } from "@/i18n/slugs";
import { pageAlternates } from "@/lib/seo/alternates";
import { pageOpenGraph } from "@/lib/seo/page-meta";
import { TASK_IDS, taskTools } from "@/lib/tasks";

type TaskPageProps = Readonly<{
  params: Promise<{ locale: string; taskSlug: string }>;
}>;

export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale as EnabledLocale;
  return TASK_IDS.map((task) => ({ taskSlug: taskSlug(task, locale) }));
}

async function resolve(params: TaskPageProps["params"]) {
  const { locale, taskSlug: slug } = await params;
  if (!hasLocale(routing.locales, locale)) return undefined;
  const task = taskIdFromSlug(slug, locale);
  return task ? { locale, task } : undefined;
}

export async function generateMetadata({ params }: TaskPageProps): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { locale, task } = resolved;
  const t = await getTranslations({ locale });
  const title = t(`Tasks.${task}.metaTitle`);
  const description = t(`Tasks.${task}.metaDescription`);
  const route = { page: "task", task } as const;
  return {
    title,
    description,
    alternates: pageAlternates(route, locale),
    openGraph: pageOpenGraph({ route, locale, siteName: t("Layout.brand"), title, description }),
  };
}

export default async function TaskPage({ params }: TaskPageProps) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { locale, task } = resolved;
  setRequestLocale(locale);
  const t = await getTranslations();
  const name = t(`Tasks.${task}.name`);
  const tools = taskTools(task);
  const others = TASK_IDS.filter((other) => other !== task);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:py-12">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            items={[
              { name: t("Seo.home"), route: { page: "home" } },
              { name: t("ToolsIndex.title"), route: { page: "tools" } },
              { name, route: { page: "task", task } },
            ]}
          />
        }
        eyebrow={t("Catalogue.toolCount", { count: tools.length })}
        title={name}
        lead={t(`Tasks.${task}.lead`)}
      />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tools.map((tool) => (
          <li key={tool.id}>
            <ToolCard tool={tool} locale={locale} headingLevel={2} />
          </li>
        ))}
      </ul>

      <nav aria-labelledby="other-tasks" className="flex flex-col gap-3">
        <h2 id="other-tasks" className="text-xl font-semibold tracking-tight">
          {t("TaskPage.otherTasks")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {others.map((other) => (
            <li key={other}>
              <Link href={routeHref({ page: "task", task: other }, locale)} className={chipClass}>
                {t(`Tasks.${other}.name`)}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/tools" className={chipClass}>
              {t("TaskPage.backToCatalogue")}
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
