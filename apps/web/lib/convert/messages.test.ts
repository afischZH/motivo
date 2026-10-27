/**
 * Converter copy: DE and EN have the same keys, every converter has all page
 * texts, and the German copy follows the style rules (no "ß", no dashes as
 * punctuation). ICU-sensitive characters are kept out of the messages.
 */
import { describe, expect, it } from "vitest";

import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { CONVERTER_IDS, FAQ_COUNT } from "./ids";

type Tree = { [key: string]: string | Tree };

function leaves(node: Tree | string, prefix = ""): [string, string][] {
  if (typeof node === "string") return [[prefix, node]];
  return Object.entries(node).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

const deLeaves = leaves(de.Converters as Tree);
const enLeaves = leaves(en.Converters as Tree);

describe("converter messages", () => {
  it("have the same keys in DE and EN", () => {
    expect(deLeaves.map(([key]) => key).sort()).toEqual(enLeaves.map(([key]) => key).sort());
  });

  it.each(CONVERTER_IDS)("cover every page text of %s", (id) => {
    const keys = new Set(enLeaves.map(([key]) => key));
    const required = [
      "name",
      "title",
      "description",
      "inputLabel",
      "placeholder",
      "whatIs",
      "howTo",
    ];
    for (let n = 1; n <= FAQ_COUNT; n++) required.push(`faq.q${n}`, `faq.a${n}`);
    expect(required.filter((key) => !keys.has(`items.${id}.${key}`))).toEqual([]);
  });

  it("use Swiss spelling and no dashes as punctuation in German", () => {
    expect(deLeaves.filter(([, text]) => text.includes("ß"))).toEqual([]);
    expect(deLeaves.filter(([, text]) => /\s[–—-]\s/.test(text))).toEqual([]);
  });

  it("avoid ICU syntax characters that would break formatting", () => {
    // `<` starts a rich-text tag and `'` escapes in ICU; use ’ instead.
    const risky = [...deLeaves, ...enLeaves].filter(([, text]) => /[<>']/.test(text));
    expect(risky).toEqual([]);
  });
});
