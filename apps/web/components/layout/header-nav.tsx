"use client";

import {
  ArrowLeftRightIcon,
  CodeXmlIcon,
  HeartIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  MenuIcon,
  PaletteIcon,
  ShapesIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { IntentLink } from "@/i18n/intent-link";
import { cn } from "@/lib/utils";

import { LogoMark } from "./logo-mark";

export interface HeaderNavItem {
  /** Localized href, resolved by the server component around this one. */
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Shows the icon in the desktop bar too (the sheet always shows it). */
  iconInBar?: boolean;
  /** Kept on the desktop link only, so tests find exactly one element. */
  testId?: string;
}

/** Translated by the server component around it (no message formatter on the client). */
export interface HeaderNavLabels {
  nav: string;
  menu: string;
  close: string;
  brand: string;
  support: string;
}

/** The current section: the item's page itself or anything below it. */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ICONS = {
  tools: ShapesIcon,
  social: MegaphoneIcon,
  patterns: CodeXmlIcon,
  convert: ArrowLeftRightIcon,
  designs: LayoutGridIcon,
  brandKit: PaletteIcon,
} as const;

function NavIcon({ icon }: { icon: HeaderNavItem["icon"] }) {
  const Icon = ICONS[icon];
  return <Icon aria-hidden="true" className="size-4 shrink-0" />;
}

/**
 * Main navigation (after the shadcnspace block navbar-01): a pill bar from
 * `lg` up, a side sheet below. The desktop links stay in the markup at every
 * width, so they remain crawlable while the sheet is closed. The link of the
 * current section carries `aria-current` and a visible marker.
 */
export function HeaderNav({
  items,
  labels,
  supportHref,
}: {
  items: HeaderNavItem[];
  labels: HeaderNavLabels;
  supportHref: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A client-side navigation leaves the header mounted: close the menu.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  return (
    <div className="flex items-center">
      <nav
        aria-label={labels.nav}
        className="hidden items-center gap-0.5 rounded-full border border-border bg-muted/70 p-1 lg:flex"
      >
        {items.map((item) => {
          const current = isCurrent(pathname, item.href);
          return (
            <IntentLink
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              data-testid={item.testId}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150 ease-out",
                current
                  ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
              )}
            >
              {item.iconInBar && <NavIcon icon={item.icon} />}
              {item.label}
            </IntentLink>
          );
        })}
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-accent lg:hidden">
          <span className="sr-only">{labels.menu}</span>
          <MenuIcon aria-hidden="true" className="size-5" />
        </SheetTrigger>
        <SheetContent side="right" closeLabel={labels.close} className="w-[min(20rem,85vw)] gap-0">
          <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
            <LogoMark className="size-7" />
            <SheetTitle className="text-base tracking-tight">{labels.brand}</SheetTitle>
          </div>
          <nav aria-label={labels.nav} className="flex flex-col gap-1 p-3">
            {items.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <IntentLink
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-lg px-3 text-base",
                    current
                      ? "bg-accent font-medium [&_svg]:text-link"
                      : "text-foreground hover:bg-accent/60 [&_svg]:text-muted-foreground",
                  )}
                >
                  <NavIcon icon={item.icon} />
                  {item.label}
                </IntentLink>
              );
            })}
          </nav>
          <Separator />
          <div className="p-3">
            <IntentLink
              href={supportHref}
              className="flex h-11 items-center gap-3 rounded-lg px-3 text-base text-foreground hover:bg-accent/60"
            >
              <HeartIcon aria-hidden="true" className="size-4 shrink-0 text-link" />
              {labels.support}
            </IntentLink>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
