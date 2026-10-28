import type { AnyToolDefinition } from "@motivo/tool-registry";
import { getTranslations } from "next-intl/server";

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
 * second link opens the editor directly. Server component, no client JS.
 */
export async function ToolCard({ tool, locale, headingLevel }: ToolCardProps) {
  const t = await getTranslations({ locale });
  // Tool keys are built from the registry id, which the typed keys cannot know.
  const text = t as unknown as (key: string, values?: Record<string, string>) => string;
  const keys = toolKeys(tool.id);
  const name = text(keys.name);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground transition-colors hover:border-ring">
      <div className="flex h-44 items-center justify-center bg-muted p-4">
        <MotifImage tool={tool} alt="" className="max-h-full w-auto rounded-md shadow-sm" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <Heading className="text-base font-semibold">
          {/* The stretched link makes the whole card clickable. */}
          <Link
            href={routeHref({ page: "landing", toolId: tool.id }, locale)}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {name}
          </Link>
        </Heading>
        <p className="text-sm text-muted-foreground">{text(keys.description)}</p>
        <Link
          href={routeHref({ page: "tool", toolId: tool.id }, locale)}
          aria-label={text("Catalogue.openEditorFor", { tool: name })}
          className="relative z-10 mt-auto self-start rounded-control pt-2 text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          {text("Catalogue.openEditor")}
        </Link>
      </div>
    </article>
  );
}
