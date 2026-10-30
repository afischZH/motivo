"use client";

import { Tooltip } from "radix-ui";
import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { cx } from "./primitives";

/**
 * Keys of a shortcut, e.g. `["mod", "shift", "Z"]`. `mod` is ⌘ on Apple
 * devices and Ctrl elsewhere, `shift` and `alt` get their symbols.
 */
export type ShortcutKeys = readonly string[];

function isApple(): boolean {
  // Only called while a tooltip is open, never during SSR.
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function keyLabel(key: string, apple: boolean): string {
  if (key === "mod") return apple ? "⌘" : "Ctrl";
  if (key === "shift") return "⇧";
  if (key === "alt") return apple ? "⌥" : "Alt";
  return key;
}

/** One key cap (shadcn/ui `Kbd`), styled for light text inside a hint as well. */
export function Kbd(props: { children: ReactNode; className?: string }) {
  return (
    <kbd
      data-slot="kbd"
      className={cx(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center rounded-sm bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground select-none",
        "[[data-slot=hint]_&]:bg-background/20 [[data-slot=hint]_&]:text-background",
        props.className,
      )}
    >
      {props.children}
    </kbd>
  );
}

/** Key caps of a shortcut, platform-aware. */
export function KbdGroup(props: { keys: ShortcutKeys }) {
  const apple = isApple();
  return (
    <kbd data-slot="kbd-group" className="inline-flex items-center gap-0.5">
      {props.keys.map((key) => (
        <Kbd key={key}>{keyLabel(key, apple)}</Kbd>
      ))}
    </kbd>
  );
}

const HintScope = createContext(false);

/** Wraps the editor so hints share one delay: after the first, the next opens at once. */
export function HintProvider(props: { children: ReactNode }) {
  return (
    <HintScope.Provider value={true}>
      <Tooltip.Provider delayDuration={400} skipDelayDuration={300}>
        {props.children}
      </Tooltip.Provider>
    </HintScope.Provider>
  );
}

export interface HintProps {
  /** Short text, usually the button's accessible name. */
  label: string;
  /** Shortcut shown as key caps after the label. */
  keys?: ShortcutKeys;
  side?: "top" | "bottom" | "left" | "right";
  /** One focusable element (a button); it keeps its own `aria-label`. */
  children: ReactElement;
}

/**
 * Styled tooltip for icon buttons, replacing the browser's `title`: it opens
 * on hover and on keyboard focus, shows at once after the first one and
 * names the shortcut. Under a `HintProvider` hints share their delay;
 * without one (a picker used on its own) the hint brings its own.
 */
export function Hint(props: HintProps) {
  const scoped = useContext(HintScope);
  const hint = (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{props.children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          data-slot="hint"
          side={props.side ?? "bottom"}
          sideOffset={6}
          collisionPadding={8}
          className={cx(
            "z-50 inline-flex max-w-64 items-center gap-2 rounded-md bg-foreground px-2 py-1 text-xs text-balance text-background shadow-md",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 motion-reduce:animate-none",
          )}
        >
          <span>{props.label}</span>
          {props.keys && props.keys.length > 0 && <KbdGroup keys={props.keys} />}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
  return scoped ? hint : <HintProvider>{hint}</HintProvider>;
}
