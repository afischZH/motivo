"use client";

import type { ComponentType, ReactNode } from "react";
import { cx } from "../controls/primitives";
import { ChevronDownIcon } from "./icons";

/** Small uppercase title of a panel section (editor side panels). */
export const SECTION_TITLE_CLASS =
  "text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase";

/** The `<summary>` of a collapsible panel section: icon, title, chevron. */
export const SECTION_SUMMARY_CLASS = cx(
  "flex h-12 cursor-pointer list-none items-center gap-2.5 select-none",
  "text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase transition-colors",
  "hover:text-foreground group-open/panel:text-foreground",
  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden",
);

export interface PanelSectionProps {
  title: ReactNode;
  /** Id of the title text, e.g. to label a region inside the section. */
  titleId?: string;
  icon?: ComponentType | undefined;
  /** Open on first render; the user toggles it afterwards. */
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
  "data-group"?: string | undefined;
}

/**
 * One collapsible section of an editor side panel (accordion row): icon and
 * uppercase title, chevron on the right, full-bleed divider below. A native
 * `<details>`, so it works without script and with the keyboard.
 */
export function PanelSection(props: PanelSectionProps) {
  const Icon = props.icon;
  return (
    <details
      open={props.defaultOpen ?? true}
      className={cx(
        "group/panel border-b border-border px-4 last:border-b-0 [&_svg]:shrink-0",
        props.className,
      )}
      data-testid={props["data-testid"]}
      data-group={props["data-group"]}
    >
      <summary className={SECTION_SUMMARY_CLASS}>
        {Icon && (
          <span className="text-muted-foreground group-open/panel:text-primary [&_svg]:size-4">
            <Icon />
          </span>
        )}
        <span id={props.titleId} className="min-w-0 flex-1 truncate">
          {props.title}
        </span>
        <span className="text-muted-foreground transition-transform duration-200 ease-out group-open/panel:rotate-180 motion-reduce:transition-none [&_svg]:size-4">
          <ChevronDownIcon />
        </span>
      </summary>
      {/* pt: small controls right below the title keep a 24 px target spacing (WCAG 2.5.8). */}
      <div className="pt-1.5 pb-4">{props.children}</div>
    </details>
  );
}
