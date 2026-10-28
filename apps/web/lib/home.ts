/**
 * Content choices of the home page. Tools are referenced by registry id;
 * `home.test.ts` makes sure every id exists and can be rendered statically,
 * so removing or renaming a tool cannot silently break the page.
 */

/** Tool in the hero preview; its stage cycles through the tool's presets. */
export const HERO_TOOL_ID = "svg-waves";

/** Tool behind the secondary hero button ("Start with ..."). */
export const HERO_START_TOOL_ID = "css-gradient";

/** Featured tools, a mix of categories with light motifs. */
export const FEATURED_TOOL_IDS = [
  "css-gradient",
  "svg-waves",
  "blob",
  "polka-dots",
  "palette-generator",
  "confetti",
] as const;

/** Number of FAQ entries on the home page (`Home.faq.q1` ... `qN`). */
export const HOME_FAQ_COUNT = 5;
