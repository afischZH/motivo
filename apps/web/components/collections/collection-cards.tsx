import type { AnyToolDefinition } from "@musterli/tool-registry";

import { MotifImage } from "@/components/seo/motif-image";
import { IntentLink } from "@/i18n/intent-link";
import type { CollectionVariant } from "@/lib/collections/variants";

/** Stretched link: the whole card is clickable, the focus ring wraps the card. */
const STRETCHED =
  "after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset";

export interface CollectionCardData {
  id: string;
  href: string;
  name: string;
  description: string;
  colors: readonly string[];
  /** Inline style of a gradient thumbnail; palettes show their swatches instead. */
  style?: Readonly<Record<string, string>>;
}

/**
 * Overview card of a gradient or a palette: a live preview (CSS, no image),
 * the name linking to the item page and a short description.
 */
export function CollectionCard({
  item,
  headingLevel,
}: {
  item: CollectionCardData;
  headingLevel: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition-[border-color,box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:border-ring hover:shadow-[0_12px_32px_-16px_oklch(0.3_0.12_275/0.35)]">
      {item.style ? (
        <div aria-hidden="true" className="h-32 border-b border-border" style={item.style} />
      ) : (
        <div aria-hidden="true" className="flex h-32 border-b border-border">
          {item.colors.map((color, i) => (
            <span key={`${color}-${i}`} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 p-4">
        <Heading className="text-base font-semibold">
          <IntentLink href={item.href} className={STRETCHED}>
            {item.name}
          </IntentLink>
        </Heading>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </div>
    </article>
  );
}

/**
 * A collection item opened in another tool: a preview of that design (live
 * CSS or the static motif SVG) and a link into the editor with the design
 * in the share hash. A full page load, because the editor reads `#d=` on start.
 */
export function VariantCard({
  variant,
  tool,
  href,
  title,
  style,
}: {
  variant: CollectionVariant;
  tool: AnyToolDefinition;
  href: string;
  /** Link text, e.g. "In Mesh Gradient öffnen". */
  title: string;
  style?: Readonly<Record<string, string>> | undefined;
}) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition-[border-color,box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:border-ring hover:shadow-[0_12px_32px_-16px_oklch(0.3_0.12_275/0.35)]">
      {variant.thumb === "css" && style ? (
        <div aria-hidden="true" className="aspect-video border-b border-border" style={style} />
      ) : (
        <div className="aspect-video overflow-hidden border-b border-border">
          <MotifImage
            tool={tool}
            designId={variant.design.id}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="p-4">
        <h3 className="text-sm font-semibold">
          <a href={href} className={STRETCHED}>
            {title}
          </a>
        </h3>
      </div>
    </article>
  );
}
