/**
 * Contract for `content/changelog` (CLAUDE.md, "Neues Tool hinzufügen" step 8):
 * one file per language with the same name, front matter with date, title and
 * tool ids, every registered tool announced in every language, and the German
 * copy follows the style rules. Nothing renders the changelog yet; this keeps
 * the entries complete until a page does.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { registry } from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL("../content/changelog/", import.meta.url));
const LOCALES = ["de", "en"] as const;
const FILE = /^(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.(de|en)\.md$/;

interface Entry {
  file: string;
  locale: string;
  date: string;
  title: string;
  tools: string[];
  body: string;
}

function parse(file: string): Entry {
  const source = readFileSync(`${DIR}${file}`, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${file}: missing front matter`);
  const [, head = "", body = ""] = match;
  const field = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, "m").exec(head)?.[1]?.trim();
  const tools = field("tools");
  return {
    file,
    locale: FILE.exec(file)?.[2] ?? "",
    date: field("date") ?? "",
    title: field("title") ?? "",
    tools: tools
      ? tools
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    body,
  };
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
const entries = files.map(parse);

describe("changelog", () => {
  it("names every file <date>-<slug>.<locale>.md", () => {
    expect(files.filter((f) => !FILE.test(f))).toEqual([]);
  });

  it("has every entry in every locale", () => {
    const stems = new Set(files.map((f) => f.replace(/\.(de|en)\.md$/, "")));
    for (const stem of stems) {
      for (const locale of LOCALES) expect(files, stem).toContain(`${stem}.${locale}.md`);
    }
  });

  it.each(entries.map((e) => [e.file, e] as const))("%s has valid front matter", (file, e) => {
    expect(e.date).toBe(FILE.exec(file)?.[1]);
    expect(e.title.length).toBeGreaterThan(0);
    expect(e.body.trim().length).toBeGreaterThan(0);
    expect(e.tools.filter((id) => registry.get(id) === undefined)).toEqual([]);
  });

  it.each(LOCALES)("announces every registered tool in %s", (locale) => {
    const announced = new Set(entries.filter((e) => e.locale === locale).flatMap((e) => e.tools));
    expect(
      registry
        .list()
        .map((t) => t.id)
        .filter((id) => !announced.has(id)),
    ).toEqual([]);
  });

  it("German entries use Swiss spelling and no dashes as punctuation", () => {
    for (const e of entries.filter((x) => x.locale === "de")) {
      // Markdown list markers ("- ") are not punctuation.
      const text = `${e.title}\n${e.body}`.replace(/^\s*- /gm, "");
      expect(text, e.file).not.toContain("ß");
      expect(text, e.file).not.toMatch(/\s[–—-]\s/);
    }
  });
});
