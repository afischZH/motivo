/**
 * Reads a tool's SEO texts from the messages. Tool keys are built from the
 * registry id (`tools.<id>.…`), which next-intl's typed keys cannot know, so
 * lookups go through a plain string translator.
 */
import type { FaqEntry } from "./json-ld";

/** Smallest and largest number of FAQ entries per tool (docs: 3 to 5). */
export const FAQ_MIN = 3;
export const FAQ_MAX = 5;

/**
 * FAQ entries from the raw `tools.<id>.seo.faq` object in numeric order.
 * Two shapes are in use and both are accepted:
 * `{ q1: { question, answer } }` and `{ q1: "question", a1: "answer" }`.
 * Malformed entries are skipped; the contract test makes sure there are none.
 */
export function faqEntries(raw: unknown): FaqEntry[] {
  if (typeof raw !== "object" || raw === null) return [];
  const faq = raw as Record<string, unknown>;
  return Object.keys(faq)
    .map((key) => Number(/^q(\d+)$/.exec(key)?.[1]))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b)
    .flatMap((n) => {
      const q = faq[`q${n}`];
      const a = faq[`a${n}`];
      if (typeof q === "string" && typeof a === "string") return [{ question: q, answer: a }];
      const entry = q as Partial<FaqEntry> | null;
      return typeof entry?.question === "string" && typeof entry.answer === "string"
        ? [{ question: entry.question, answer: entry.answer }]
        : [];
    });
}

/** Message keys of a tool's texts. */
export const toolKeys = (toolId: string) => ({
  name: `tools.${toolId}.name`,
  description: `tools.${toolId}.description`,
  whatIs: `tools.${toolId}.seo.whatIs`,
  howTo: `tools.${toolId}.seo.howTo`,
  faq: `tools.${toolId}.seo.faq`,
});
