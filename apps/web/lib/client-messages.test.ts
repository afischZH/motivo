import { describe, expect, it } from "vitest";

import editorDe from "@motivo/editor-ui/messages/de.json";
import de from "@/messages/de.json";

import { CONVERTER_CLIENT_NAMESPACES, editorMessages, pickMessages } from "./client-messages";

const all = { ...de, ...editorDe } as Record<string, unknown>;

describe("client messages", () => {
  it("sends only the converter texts to converters", () => {
    expect(Object.keys(pickMessages(all, CONVERTER_CLIENT_NAMESPACES))).toEqual(["Converters"]);
  });

  it("keeps legal and home texts out of client payloads", () => {
    for (const picked of [pickMessages(all, CONVERTER_CLIENT_NAMESPACES), editorMessages(all)]) {
      expect(picked).not.toHaveProperty("Legal");
      expect(picked).not.toHaveProperty("Home");
    }
  });

  it("gives the editor its namespaces and tool texts without SEO copy", () => {
    const editor = editorMessages(all);
    expect(Object.keys(editor).sort()).toEqual(
      ["Designs", "Editor", "ToolPage", "sizes", "tools"].sort(),
    );
    const tools = editor.tools as Record<string, Record<string, unknown>>;
    expect(Object.keys(tools)).toEqual(Object.keys(de.tools));
    for (const [id, entry] of Object.entries(tools)) {
      expect(entry, id).not.toHaveProperty("seo");
      if (id !== "common") expect(entry, id).toHaveProperty("name");
    }
    expect(JSON.stringify(editor).length).toBeLessThan(JSON.stringify(all).length / 1.5);
  });
});
