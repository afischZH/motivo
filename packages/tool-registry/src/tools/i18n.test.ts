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
import { SHAPE_IDS, SHAPE_PACK_IDS } from "@musterli/engine";
import { shapeLabelKey, shapePackLabelKey } from "../shapes";

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

type Hints = NonNullable<AnyToolDefinition["controls"]>;

/** Label keys of the params of one object schema (the tool, or the item of a list param). */
function paramKeys(toolId: string, shape: z.ZodRawShape, controls: Hints | undefined): string[] {
  const keys: string[] = [];
  const hints = (controls?.params ?? {}) as NonNullable<Hints["params"]>;
  for (const [param, schema] of Object.entries(shape)) {
    const hint = hints[param];
    if (hint?.kind === "hidden") continue;
    keys.push(hint?.labelKey ?? `tools.${toolId}.params.${param}.label`);
    for (const group of hint?.optionGroups ?? []) keys.push(group.labelKey);
    if (schema instanceof z.ZodEnum) {
      const labels = hint?.optionLabelKeys ?? {};
      for (const option of schema.options) {
        keys.push(
          labels[String(option)] ?? `missing optionLabelKeys for ${param}.${String(option)}`,
        );
      }
    }
    if (schema instanceof z.ZodArray && schema.element instanceof z.ZodObject) {
      const list = hint?.list;
      if (list?.itemLabelKey) keys.push(list.itemLabelKey);
      keys.push(...paramKeys(toolId, schema.element.shape, list?.item as Hints | undefined));
    }
  }
  for (const group of controls?.groups ?? []) keys.push(group.labelKey);
  return keys;
}

function referencedKeys(tool: AnyToolDefinition): string[] {
  const keys = [`tools.${tool.id}.name`, `tools.${tool.id}.description`];
  keys.push(...paramKeys(tool.id, tool.schema.shape, tool.controls));
  for (const preset of tool.presets) keys.push(preset.nameKey);
  for (const size of tool.sizePresets ?? []) keys.push(size.nameKey);
  for (const hint of Object.values(tool.controls?.params ?? {})) {
    if (hint?.descriptionKey !== undefined) keys.push(hint.descriptionKey);
  }
  for (const bundle of tool.bundles ?? []) {
    keys.push(bundle.labelKey);
    if (bundle.descriptionKey !== undefined) keys.push(bundle.descriptionKey);
    if (bundle.snippet) keys.push(bundle.snippet.labelKey);
  }
  return keys;
}

describe.each(Object.entries(LOCALES))("messages %s", (_, messages) => {
  it.each(builtInTools.map((t) => [t.id, t] as const))("has every key of %s", (_, tool) => {
    const missing = referencedKeys(tool).filter((k) => typeof lookup(messages, k) !== "string");
    expect(missing).toEqual([]);
  });
});

describe.each(Object.entries(LOCALES))("shape library messages %s", (_, messages) => {
  it("names every pack and every shape", () => {
    const keys = [...SHAPE_PACK_IDS.map(shapePackLabelKey), ...SHAPE_IDS.map(shapeLabelKey)];
    expect(keys.filter((k) => typeof lookup(messages, k) !== "string")).toEqual([]);
  });
});

describe("German tool copy", () => {
  const strings = (node: unknown): string[] =>
    typeof node === "string"
      ? [node]
      : typeof node === "object" && node !== null
        ? Object.values(node).flatMap(strings)
        : [];
  const de = [...strings(LOCALES.de.tools), ...strings(LOCALES.de.Shapes)];

  it("uses Swiss spelling (no ß)", () => {
    expect(de.filter((s) => s.includes("ß"))).toEqual([]);
  });

  it("uses no dashes as punctuation", () => {
    expect(de.filter((s) => /\s[–—-]\s/.test(s))).toEqual([]);
  });
});
