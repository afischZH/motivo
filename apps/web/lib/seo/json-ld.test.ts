import { describe, expect, it } from "vitest";

import {
  breadcrumbList,
  collectionPage,
  faqPage,
  serializeJsonLd,
  webApplication,
} from "./json-ld";

describe("serializeJsonLd", () => {
  it("cannot close the script element or open a comment", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script><!-- & \u2028" });
    expect(out).not.toMatch(/[<>&\u2028]/);
    expect(out).toContain("\\u003c/script\\u003e");
    // Still valid JSON with the original text.
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script><!-- & \u2028" });
  });
});

describe("schema builders", () => {
  it("describes a free web application without ratings", () => {
    const app = webApplication({
      name: "Blob Generator",
      description: "Organic shapes.",
      url: "https://example.test/en/blob-generator",
      inLanguage: "en",
      category: "DesignApplication",
      currency: "CHF",
    });
    expect(app).toMatchObject({
      "@type": "WebApplication",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "CHF" },
    });
    expect(app).not.toHaveProperty("aggregateRating");
    expect(app).not.toHaveProperty("image");
  });

  it("builds FAQ and breadcrumbs", () => {
    expect(faqPage([{ question: "Q?", answer: "A." }], "de")).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Q?", acceptedAnswer: { text: "A." } }],
    });
    expect(
      breadcrumbList([
        { name: "Home", url: "https://x.test/en" },
        { name: "Tools", url: "https://x.test/en/tools" },
      ]).itemListElement,
    ).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://x.test/en" },
      { "@type": "ListItem", position: 2, name: "Tools", item: "https://x.test/en/tools" },
    ]);
  });
});

describe("collectionPage", () => {
  it("lists the items in order as an ItemList", () => {
    const data = collectionPage({
      name: "Gradients",
      description: "Original gradients",
      url: "https://x.test/en/gradients",
      inLanguage: "en",
      items: [
        { name: "Glacier", url: "https://x.test/en/gradients/glacier" },
        { name: "Slate", url: "https://x.test/en/gradients/slate" },
      ],
    });
    expect(data).toMatchObject({
      "@type": "CollectionPage",
      isAccessibleForFree: true,
      mainEntity: { "@type": "ItemList", numberOfItems: 2 },
    });
    expect(data).not.toHaveProperty("image");
    expect((data.mainEntity as { itemListElement: unknown[] }).itemListElement[1]).toEqual({
      "@type": "ListItem",
      position: 2,
      name: "Slate",
      url: "https://x.test/en/gradients/slate",
    });
  });
});
