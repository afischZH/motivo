import { FOCUS_RING, cx } from "../controls/primitives";

/** Quiet outline button (toolbar, dialogs). */
export const BUTTON_CLASS = cx(
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground shadow-xs transition-colors",
  "hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
  FOCUS_RING,
);

/** Square icon-only variant of `BUTTON_CLASS`. */
export const ICON_BUTTON = cx(BUTTON_CLASS, "w-8 px-0");

/** Borderless icon button for quiet toolbar actions (undo, redo, shortcuts). */
export const GHOST_ICON_BUTTON = cx(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
  "hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
  FOCUS_RING,
);

/** The one primary action per screen (Export). */
export const PRIMARY_BUTTON_CLASS = cx(
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs transition-colors",
  "hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
  FOCUS_RING,
);

/** Selectable thumbnail tile (presets, filmstrip). */
export const TILE_CLASS = cx(
  "group/tile flex shrink-0 flex-col items-center gap-1 rounded-xl border border-transparent p-1 text-xs text-muted-foreground transition-colors",
  "hover:border-border hover:bg-accent/40 hover:text-foreground",
  "aria-pressed:border-primary aria-pressed:bg-highlight aria-pressed:text-foreground aria-[current=true]:border-primary aria-[current=true]:bg-highlight aria-[current=true]:text-foreground",
  FOCUS_RING,
);
