"use client";

import { HistoryIcon, StarIcon } from "lucide-react";

import { chipClass } from "@/components/ui/chip";
import { IntentLink } from "@/i18n/intent-link";

import { useToolHistory } from "./use-tool-history";

export interface YourToolLink {
  id: string;
  label: string;
  href: string;
}

/**
 * "Deine Tools" above the catalogue (W1-AP03): favourites and the tools
 * used last in this browser, as quick links. Nothing in the server HTML
 * (the lists exist only in the browser), and nothing at all while both
 * lists are empty.
 */
export function YourTools({
  tools,
  labels,
}: {
  tools: YourToolLink[];
  labels: { title: string; favorites: string; recent: string };
}) {
  const { favorites, recent, loaded } = useToolHistory();
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  const pick = (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  const favoriteTools = pick(favorites);
  const recentTools = pick(recent.filter((id) => !favorites.includes(id)));
  if (!loaded || (favoriteTools.length === 0 && recentTools.length === 0)) return null;

  const row = (title: string, Icon: typeof StarIcon, list: YourToolLink[], testId: string) =>
    list.length > 0 && (
      <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
        <h3 className="me-1 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
          {title}
        </h3>
        <ul className="contents">
          {list.map((tool) => (
            <li key={tool.id}>
              <IntentLink href={tool.href} className={chipClass}>
                {tool.label}
              </IntentLink>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section
      aria-labelledby="your-tools"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
      data-testid="your-tools"
    >
      <h2 id="your-tools" className="font-semibold">
        {labels.title}
      </h2>
      {row(labels.favorites, StarIcon, favoriteTools, "your-tools-favorites")}
      {row(labels.recent, HistoryIcon, recentTools, "your-tools-recent")}
    </section>
  );
}
