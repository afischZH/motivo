/**
 * Jump links to the mood groups of a collection page (`#group-<id>`).
 * Plain anchors: no client JS, works with the keyboard and without script.
 */
export function GroupNav({
  label,
  groups,
}: {
  label: string;
  groups: readonly { id: string; name: string; count: string }[];
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {groups.map((group) => (
          <li key={group.id}>
            <a
              href={`#group-${group.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm shadow-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {group.name}
              <span className="text-muted-foreground">{group.count}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
