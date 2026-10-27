import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFixtureRegistry } from "../test/fixture-tool";
import { useEffect } from "react";
import { createEditorStore, type EditorStoreApi } from "./editor-store";
import { EditorStoreProvider, useEditorStore, useEditorStoreApi } from "./react";

function Count() {
  const count = useEditorStore((s) => s.params.count);
  return <output>{String(count)}</output>;
}

describe("EditorStoreProvider", () => {
  it("creates a store from options once and re-renders subscribers", () => {
    let api: EditorStoreApi | undefined;
    const grab = (value: EditorStoreApi) => {
      api = value;
    };
    function Grab() {
      const value = useEditorStoreApi();
      useEffect(() => grab(value));
      return null;
    }
    const options = { toolId: "test-fixture", registry: createFixtureRegistry() };
    const { rerender } = render(
      <EditorStoreProvider options={options}>
        <Count />
        <Grab />
      </EditorStoreProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("10");
    const first = api;
    act(() => api?.getState().setParam("count", 4));
    expect(screen.getByRole("status").textContent).toBe("4");
    rerender(
      <EditorStoreProvider options={{ ...options }}>
        <Count />
        <Grab />
      </EditorStoreProvider>,
    );
    expect(api).toBe(first);
  });

  it("uses a given store", () => {
    const store = createEditorStore({ toolId: "test-fixture", registry: createFixtureRegistry() });
    store.getState().setParam("count", 2);
    render(
      <EditorStoreProvider store={store}>
        <Count />
      </EditorStoreProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("2");
  });

  it("throws outside a provider", () => {
    const silence = console.error;
    console.error = () => undefined;
    try {
      expect(() => render(<Count />)).toThrow(/EditorStoreProvider/);
    } finally {
      console.error = silence;
    }
  });
});
