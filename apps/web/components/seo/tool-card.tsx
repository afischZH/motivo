import type { AnyToolDefinition } from "@musterli/tool-registry";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { FavoriteButton } from "@/components/tool-history/favorite-button";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref } from "@/i18n/paths";
import { toolKeys } from "@/lib/seo/tool-content";

import { MotifImage } from "./motif-image";

interface ToolCardProps {
  tool: AnyToolDefinition;
  locale: EnabledLocale;
  /** Heading level of the tool name inside the surrounding outline. */
  headingLevel: 2 | 3;
}

/**
 * Catalogue card: the motif and name link to the tool's landing page, a
 * second link opens the editor directly. Server component; only the favourite star is client JS.
 * The motif fills the top of the card; the card lifts on hover.
 */
export async function ToolCard({ tool, locale, headingLevel }: ToolCardProps) {
  const t = await getTranslations({ locale });
  // Tool keys are built from the registry id, which the typed keys cannot know.
  const text = t as unknown as (key: string, values?: Record<string, string>) => string;
  const keys = toolKeys(tool.id);
  const name = text(keys.name);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition-[border-color,box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:border-ring hover:shadow-[0_12px_32px_-16px_oklch(0.3_0.12_275/0.35)]">
      {/* The motif fills the card's stage edge to edge: the output is the pitch. */}
      <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-canvas">
        <MotifImage
          tool={tool}
          alt=""
          className="size-full max-w-none object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        {/* Above the stretched link, so it toggles instead of opening the page. */}
        <FavoriteButton
          toolId={tool.id}
          label={text("Catalogue.favorite", { tool: name })}
          className="absolute top-2.5 right-2.5 z-10"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <Heading className="text-base font-semibold">
          {/* The stretched link makes the whole card clickable. */}
          <Link
            href={routeHref({ page: "landing", toolId: tool.id }, locale)}
            className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {name}
          </Link>
        </Heading>
        <p className="text-sm text-pretty text-muted-foreground">{text(keys.description)}</p>
        <Link
          href={routeHref({ page: "tool", toolId: tool.id }, locale)}
          aria-label={text("Catalogue.openEditorFor", { tool: name })}
          className="relative z-10 mt-auto inline-flex items-center gap-1 self-start rounded-control pt-3 text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          {text("Catalogue.openEditor")}
          <ArrowRightIcon aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </article>
  );
}
