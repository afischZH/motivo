"use client";

import { StarIcon } from "lucide-react";

import { toggleFavoriteTool } from "@/lib/tool-history";
import { cn } from "@/lib/utils";

import { useToolHistory } from "./use-tool-history";

/**
 * Star toggle for a tool (W1-AP03). A toggle button (`aria-pressed`) with
 * a constant name, so screen readers announce "pressed" instead of a new
 * label. Favourites live in this browser only.
 */
export function FavoriteButton({
  toolId,
  label,
  className,
}: {
  toolId: string;
  /** e.g. "Favorite: Flow Field", translated by the caller. */
  label: string;
  className?: string;
}) {
  const { favorites, loaded } = useToolHistory();
  const pressed = favorites.includes(toolId);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      // Without stored data the state is unknown until hydration; the button waits.
      disabled={!loaded}
      onClick={() => toggleFavoriteTool(toolId)}
      data-testid="favorite-toggle"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60",
        pressed && "text-amber-500 hover:text-amber-600 dark:text-amber-400",
        className,
      )}
    >
      <StarIcon aria-hidden="true" className={cn("size-4", pressed && "fill-current")} />
    </button>
  );
}
