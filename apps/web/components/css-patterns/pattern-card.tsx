import { Link } from "@/i18n/navigation";
import type { EnabledLocale } from "@/i18n/locales";
import { routeHref } from "@/i18n/paths";
import type { PatternStyle } from "@/lib/css-patterns";

export interface PatternCardData {
  id: string;
  category: string;
  name: string;
  description: string;
  categoryLabel: string;
  /** The pattern's CSS as an inline style: the thumbnail is the real CSS, no image. */
  style: PatternStyle;
}

/**
 * Library card: a live CSS thumbnail plus the name, which links to the
 * pattern page (stretched over the whole card). No hooks, so it renders in
 * server and client components alike.
 */
export function PatternCard({
  pattern,
  locale,
  headingLevel,
}: {
  pattern: PatternCardData;
  locale: EnabledLocale;
  headingLevel: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground transition-colors hover:border-ring">
      <div aria-hidden="true" className="h-36 border-b border-border" style={pattern.style} />
      <div className="flex flex-1 flex-col gap-1 p-4">
        <Heading className="text-base font-semibold">
          <Link
            href={routeHref({ page: "pattern", patternId: pattern.id }, locale)}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {pattern.name}
          </Link>
        </Heading>
        <p className="text-sm text-muted-foreground">{pattern.description}</p>
        <p className="mt-auto pt-2 text-xs text-muted-foreground">{pattern.categoryLabel}</p>
      </div>
    </article>
  );
}
