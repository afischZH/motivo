import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref } from "@/i18n/paths";
import { collectionText } from "@/lib/collections/text";
import type { TeaserPreview } from "@/lib/collections/teaser";
import type { CollectionKind } from "@/i18n/slugs";

/**
 * A pointer to a curated collection, for category pages, tool landing pages
 * and the other collection: optional small previews, a short text and a link.
 * Server component without client JS.
 */
export async function CollectionTeaser({
  kind,
  locale,
  previews = [],
}: {
  kind: CollectionKind;
  locale: EnabledLocale;
  /** From `teaserPreviews`; left out where the item data would grow the bundle. */
  previews?: readonly TeaserPreview[];
}) {
  const t = await collectionText(locale);
  const ns = kind === "gradients" ? "Collections.gradientsTeaser" : "Collections.palettesTeaser";
  const headingId = `${kind}-teaser-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 text-card-foreground sm:flex-row sm:items-center sm:p-6"
    >
      {previews.length > 0 && (
        <ul aria-hidden="true" className="grid shrink-0 grid-cols-4 gap-2 sm:w-64">
          {previews.map((preview) => (
            <li key={preview.id} className="flex aspect-square overflow-hidden rounded-md">
              {preview.style ? (
                <span className="flex-1" style={preview.style} />
              ) : (
                preview.colors.map((color, i) => (
                  <span
                    key={`${color}-${i}`}
                    className="flex-1"
                    style={{ backgroundColor: color }}
                  />
                ))
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col items-start gap-2">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          {t(`${ns}.heading`)}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">{t(`${ns}.lead`)}</p>
        <Link
          href={routeHref({ page: kind }, locale)}
          className="rounded-control text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          {t(`${ns}.link`)}
        </Link>
      </div>
    </section>
  );
}
