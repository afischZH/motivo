import type { ReactNode, Ref } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Breadcrumb trail above the eyebrow, if the page has one. */
  breadcrumbs?: ReactNode;
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
 * Shared page intro: a soft panel with the brand wash and a faint grid (the
 * home hero in small), then breadcrumbs, an outline badge, the heading and
 * the lead. Plain markup, usable from server and client components.
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
        "relative isolate flex flex-col items-start gap-4 overflow-hidden rounded-3xl border border-border bg-card px-5 py-8 sm:px-8 sm:py-10",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(55%_90%_at_85%_0%,var(--highlight),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_left,black,transparent_70%)] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40"
      />
      {breadcrumbs}
      {eyebrow && (
        <Badge
          variant="outline"
          className="h-7 rounded-full bg-background px-3 text-sm font-normal"
        >
          {eyebrow}
        </Badge>
      )}
      <h1
        ref={headingRef}
        tabIndex={headingTabIndex}
        className="text-3xl font-semibold tracking-[-0.03em] text-balance break-words hyphens-auto focus:outline-none sm:text-4xl lg:text-5xl"
      >
        {title}
      </h1>
      {lead && <p className="max-w-prose text-lg text-pretty text-muted-foreground">{lead}</p>}
      {children}
    </header>
  );
}
