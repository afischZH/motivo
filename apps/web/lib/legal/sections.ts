/** Structure of the legal pages; texts live in the messages under `Legal`. */

export type LegalPageId = "imprint" | "privacy" | "terms";

/** Section order per page; texts live under `Legal.<page>.sections.<id>`. */
export const LEGAL_SECTIONS = {
  imprint: ["contact", "responsible", "liability", "links", "copyright"],
  privacy: [
    "controller",
    "law",
    "hosting",
    "analytics",
    "errors",
    "cookies",
    "local",
    "share",
    "contact",
    "donations",
    "transfer",
    "retention",
    "rights",
    "changes",
  ],
  terms: ["scope", "free", "local", "exports", "uploads", "fair", "donations", "law", "changes"],
} as const satisfies Record<LegalPageId, readonly string[]>;

/**
 * Where the operator block appears: first on the imprint, after "controller"
 * in the policy; the terms point to the imprint instead (`undefined`).
 */
export const OPERATOR_AFTER: Record<LegalPageId, string | null | undefined> = {
  imprint: null,
  privacy: "controller",
  terms: undefined,
};
