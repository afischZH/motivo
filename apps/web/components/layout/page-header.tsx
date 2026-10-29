import type { ReactNode, Ref } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Breadcrumb trail above the heading, if the page has one. */
  breadcrumbs?: ReactNode;
  /** Short meta label (a count, a status), shown after the lead. */
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Buttons, hints or chips below the lead. */
  children?: ReactNode;
  /** For pages that move focus to the heading (local designs, brand kit). */
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
  className?: string;
}

/**
 * Shared page intro on the dark workbench of the home hero (it scopes the
 * `.dark` tokens, so it reads the same in both themes): breadcrumbs, the
 * heading, the lead, then a quiet count or label and any actions. The label
 * follows the heading instead of sitting above it.
 */
export function PageHeader({
  breadcrumbs,
  eyebrow,
  title,
  lead,
  children,
  headingRef,
  headingTabIndex,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "dark relative isolate flex flex-col items-start gap-4 overflow-hidden rounded-3xl border border-border bg-background px-5 py-8 text-foreground sm:px-8 sm:py-10",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(50%_100%_at_90%_0%,oklch(0.55_0.2_275/0.35),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_left,black,transparent_80%)] [background-image:radial-gradient(oklch(1_0_0/0.09)_1px,transparent_1px)] [background-size:20px_20px]"
      />
      {breadcrumbs}
      <h1
        ref={headingRef}
        tabIndex={headingTabIndex}
        className="text-3xl font-semibold tracking-[-0.03em] text-balance break-words hyphens-auto focus:outline-none sm:text-4xl lg:text-5xl"
      >
        {title}
      </h1>
      {lead && <p className="max-w-prose text-lg text-pretty text-muted-foreground">{lead}</p>}
      {eyebrow && (
        <Badge
          variant="outline"
          className="h-7 rounded-full bg-transparent px-3 text-sm font-normal text-muted-foreground"
        >
          {eyebrow}
        </Badge>
      )}
      {children}
    </header>
  );
}
