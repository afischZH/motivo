import { serializeJsonLd, type JsonLd } from "@/lib/seo/json-ld";

/** Inline JSON-LD. The payload is escaped by `serializeJsonLd`, never raw user text. */
export function JsonLdScript({ data }: { data: JsonLd | readonly JsonLd[] }) {
  return (
    <script
      type="application/ld+json"
      // Safe: serializeJsonLd escapes <, > and &, so the script cannot be closed early.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
