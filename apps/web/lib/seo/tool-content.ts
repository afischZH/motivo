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

/** Number of use cases and tips on every landing page (docs: exactly 3 each). */
export const USE_CASE_COUNT = 3;
export const TIP_COUNT = 3;

export interface UseCase {
  title: string;
  text: string;
}

/** Values of `{ <prefix>1: …, <prefix>2: … }` in numeric order. */
function numbered(raw: unknown, prefix: string): unknown[] {
  if (typeof raw !== "object" || raw === null) return [];
  const entries = raw as Record<string, unknown>;
  return Object.keys(entries)
    .map((key) => (key.startsWith(prefix) ? Number(key.slice(prefix.length)) : Number.NaN))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b)
    .map((n) => entries[`${prefix}${n}`]);
}

/** Use cases from `tools.<id>.seo.useCases` (`{ u1: { title, text } }`); malformed entries are skipped. */
export function landingUseCases(raw: unknown): UseCase[] {
  return numbered(raw, "u").flatMap((value) => {
    const entry = value as Partial<UseCase> | null;
    return typeof entry?.title === "string" && typeof entry.text === "string"
      ? [{ title: entry.title, text: entry.text }]
      : [];
  });
}

/** Tips from `tools.<id>.seo.tips` (`{ t1: "…" }`); malformed entries are skipped. */
export function tipEntries(raw: unknown): string[] {
  return numbered(raw, "t").filter((value): value is string => typeof value === "string");
}

/**
 * Heading of a landing page (H1 and page title): the optional
 * `tools.<id>.seo.heading`, for example the name plus a common foreign
 * search term ("Punktmuster (Polka Dots)"), otherwise the tool name.
 */
export function landingHeading(seo: unknown, name: string): string {
  const heading = (seo as { heading?: unknown } | null)?.heading;
  return typeof heading === "string" && heading.trim() !== "" ? heading : name;
}

/** Message keys of a tool's texts. */
export const toolKeys = (toolId: string) => ({
  name: `tools.${toolId}.name`,
  description: `tools.${toolId}.description`,
  seo: `tools.${toolId}.seo`,
  whatIs: `tools.${toolId}.seo.whatIs`,
  howTo: `tools.${toolId}.seo.howTo`,
  useCases: `tools.${toolId}.seo.useCases`,
  tips: `tools.${toolId}.seo.tips`,
  faq: `tools.${toolId}.seo.faq`,
});
