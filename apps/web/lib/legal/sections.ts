/** Structure of the legal pages; texts live in the messages under `Legal`. */

export type LegalPageId = "imprint" | "privacy";

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
    "waitlist",
    "transfer",
    "retention",
    "rights",
    "changes",
  ],
} as const satisfies Record<LegalPageId, readonly string[]>;

/** Where the operator block appears: first on the imprint, after "controller" in the policy. */
export const OPERATOR_AFTER: Record<LegalPageId, string | null> = {
  imprint: null,
  privacy: "controller",
};
