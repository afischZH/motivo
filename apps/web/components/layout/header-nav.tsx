"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { IntentLink } from "@/i18n/intent-link";
import { cn } from "@/lib/utils";

export interface HeaderNavItem {
  /** Localized href, resolved by the server component around this one. */
  href: string;
  label: string;
  icon?: "designs" | "brandKit";
  /** Kept on the desktop link only, so tests find exactly one element. */
  testId?: string;
}

/** Translated by the server component around it (no message formatter on the client). */
export interface HeaderNavLabels {
  nav: string;
  menu: string;
}

/** The current section: the item's page itself or anything below it. */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Main navigation: inline links from `md` up, a disclosure menu below. The
 * link of the current section carries `aria-current` and a visible marker.
 */
export function HeaderNav({ items, labels }: { items: HeaderNavItem[]; labels: HeaderNavLabels }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // A client-side navigation leaves the header mounted: close the menu.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="flex items-center">
      <nav aria-label={labels.nav} className="hidden items-center gap-1 md:flex">
        {items.map((item) => {
          const current = isCurrent(pathname, item.href);
          return (
            <IntentLink
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              data-testid={item.testId}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-sm transition-colors duration-150 ease-out",
                current
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {item.icon && <NavIcon icon={item.icon} />}
              {item.label}
            </IntentLink>
          );
        })}
      </nav>

      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden"
      >
        <span className="sr-only">{labels.menu}</span>
        <MenuIcon open={open} />
      </button>

      {/* Below the header bar, full width; hidden, not unmounted, so links stay crawlable. */}
      <nav
        id={panelId}
        aria-label={labels.nav}
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-b border-border bg-background shadow-[0_16px_32px_-24px_oklch(0.2_0.02_275/0.4)] md:hidden"
      >
        <ul className="mx-auto flex max-w-6xl flex-col px-2 py-2">
          {items.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <li key={item.href}>
                <IntentLink
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-control px-3 text-base",
                    current ? "bg-accent font-medium" : "hover:bg-accent/60",
                  )}
                >
                  {item.icon ? (
                    <NavIcon icon={item.icon} />
                  ) : (
                    <span aria-hidden="true" className="size-4" />
                  )}
                  {item.label}
                </IntentLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

const ICON_PROPS = {
  className: "size-4 shrink-0",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

function NavIcon({ icon }: { icon: NonNullable<HeaderNavItem["icon"]> }) {
  if (icon === "designs") {
    return (
      <svg {...ICON_PROPS}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  return (
    <svg {...ICON_PROPS}>
      <circle cx="13.5" cy="6.5" r="1.5" />
      <circle cx="17.5" cy="10.5" r="1.5" />
      <circle cx="8.5" cy="7.5" r="1.5" />
      <circle cx="6.5" cy="12.5" r="1.5" />
      <path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.7 5.7 0 0 0 22 9.7C22 5.4 17.5 2 12 2Z" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg {...ICON_PROPS} className="size-5 shrink-0">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}
