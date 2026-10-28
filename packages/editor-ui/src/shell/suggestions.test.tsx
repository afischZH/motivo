import { colorSchema, createRegistry, defineTool, type Preset } from "@musterli/tool-registry";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { createEditorStore } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { fixtureMessages, renderWithIntl } from "../test/render";
import { SuggestionsSection } from "./suggestions";

const schema = z.object({ color: colorSchema, radius: z.number().min(0).max(40) });
type P = z.output<typeof schema>;
const defaults: P = { color: "#777777", radius: 8 };
const presets: Preset<P>[] = [{ id: "a", nameKey: "tools.test-code.presets.a", params: defaults }];

const tool = defineTool({
  id: "test-code",
  version: 1,
  category: ["colors"],
  schema,
  defaults,
  presets,
  randomize: (_rng, current) => current,
  suggestions: (p) =>
    p.color === "#000000"
      ? []
      : [
          {
            id: "darker",
            labelKey: "tools.test-code.suggestions.darker",
            values: { color: "#000000" },
            swatch: "#000000",
            patch: { color: "#000000" },
          },
        ],
  render: {
    kind: "css",
    render: (p) => ({ css: `background-color: ${p.color}; border-radius: ${p.radius}px;` }),
  },
  exports: ["css"],
});

const messages = {
  ...fixtureMessages,
  tools: {
    ...fixtureMessages.tools,
    "test-code": { suggestions: { darker: "Dunkler: {color}" } },
  },
};

describe("SuggestionsSection", () => {
  it("lists the tool's suggestions and applies one as an undo step", () => {
    const registry = createRegistry();
    registry.register(tool);
    const store = createEditorStore({ toolId: "test-code", registry });
    const applied: string[] = [];
    renderWithIntl(
      <EditorStoreProvider store={store}>
        <SuggestionsSection onApplied={(m) => applied.push(m)} />
      </EditorStoreProvider>,
      messages,
    );
    const region = screen.getByRole("region", { name: "Vorschläge" });
    const button = screen.getByRole("button", { name: "Dunkler: #000000" });
    expect(region.contains(button)).toBe(true);
    fireEvent.click(button);
    expect(store.getState().params.color).toBe("#000000");
    expect(applied).toEqual(["Übernommen: Dunkler: #000000"]);
    // Nothing left to suggest: the section disappears.
    expect(screen.queryByRole("region", { name: "Vorschläge" })).toBeNull();
    store.getState().undo();
    expect(store.getState().params.color).toBe("#777777");
  });
});
