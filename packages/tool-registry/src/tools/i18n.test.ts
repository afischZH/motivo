/**
 * Every i18n key a built-in tool references must exist in the web app's DE
 * and EN messages, and the German copy must follow the style rules
 * (Swiss spelling without "ß", no dashes as punctuation).
 */
import { describe, expect, it } from "vitest";
import * as z from "zod";
// Test-only cross-package import; the messages live in the web app.
import de from "../../../../apps/web/messages/de.json";
import en from "../../../../apps/web/messages/en.json";
import type { AnyToolDefinition } from "../types";
import { builtInTools } from "./index";

type Messages = Record<string, unknown>;

const LOCALES: Record<"de" | "en", Messages> = { de, en };

function lookup(messages: Messages, key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Messages)[part];
  }
  return node;
}

function referencedKeys(tool: AnyToolDefinition): string[] {
  const keys = [`tools.${tool.id}.name`, `tools.${tool.id}.description`];
  const hints = tool.controls?.params ?? {};
  for (const [param, schema] of Object.entries(tool.schema.shape)) {
    const hint = hints[param];
    keys.push(hint?.labelKey ?? `tools.${tool.id}.params.${param}.label`);
    if (schema instanceof z.ZodEnum) {
      const labels = hint?.optionLabelKeys ?? {};
      for (const option of schema.options) {
        keys.push(
          labels[String(option)] ?? `missing optionLabelKeys for ${param}.${String(option)}`,
        );
      }
    }
  }
  for (const group of tool.controls?.groups ?? []) keys.push(group.labelKey);
  for (const preset of tool.presets) keys.push(preset.nameKey);
  return keys;
}

describe.each(Object.entries(LOCALES))("messages %s", (_, messages) => {
  it.each(builtInTools.map((t) => [t.id, t] as const))("has every key of %s", (_, tool) => {
    const missing = referencedKeys(tool).filter((k) => typeof lookup(messages, k) !== "string");
    expect(missing).toEqual([]);
  });
});

describe("German tool copy", () => {
  const strings = (node: unknown): string[] =>
    typeof node === "string"
      ? [node]
      : typeof node === "object" && node !== null
        ? Object.values(node).flatMap(strings)
        : [];
  const de = strings(LOCALES.de.tools);

  it("uses Swiss spelling (no ß)", () => {
    expect(de.filter((s) => s.includes("ß"))).toEqual([]);
  });

  it("uses no dashes as punctuation", () => {
    expect(de.filter((s) => /\s[–—-]\s/.test(s))).toEqual([]);
  });
});
