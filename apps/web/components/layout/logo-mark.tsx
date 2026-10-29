/**
 * Musterli mark: a rounded tile with a 2 × 2 dot pattern, the smallest
 * possible "pattern". Own drawing; colors follow the theme tokens.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <circle cx="11" cy="11" r="4" className="fill-primary-foreground" />
      <circle cx="21" cy="11" r="4" className="fill-primary-foreground opacity-60" />
      <circle cx="11" cy="21" r="4" className="fill-primary-foreground opacity-60" />
      <circle cx="21" cy="21" r="4" className="fill-primary-foreground opacity-30" />
    </svg>
  );
}
