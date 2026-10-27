import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorStore, type EditorStoreApi } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { createFixtureRegistry, fixtureDefaults, fixtureTool } from "../test/fixture-tool";
import { renderWithIntl } from "../test/render";
import { ControlPanel, EditorControls } from "./control-panel";

let store: EditorStoreApi;

function renderEditor() {
  store = createEditorStore({
    toolId: "test-fixture",
    registry: createFixtureRegistry(),
    randomSeed: () => 7,
  });
  const user = userEvent.setup();
  const result = renderWithIntl(
    <EditorStoreProvider store={store}>
      <EditorControls />
    </EditorStoreProvider>,
  );
  return { user, ...result };
}

const params = () => store.getState().params;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("EditorControls layout", () => {
  it("renders declared groups as disclosure sections, collapsed as hinted", () => {
    const { container } = renderEditor();
    const groups = [...container.querySelectorAll("details[data-group], details:not([data-group])")]
      .filter((d) => d.parentElement?.dataset.tool === "test-fixture")
      .map((d) => [d.querySelector("summary")?.textContent, (d as HTMLDetailsElement).open]);
    expect(groups).toEqual([
      ["Form", true],
      ["Stil", false],
      ["Weitere Einstellungen", true],
    ]);
  });

  it("labels every visible control and hides hidden or invisible params", () => {
    renderEditor();
    expect(screen.getByRole("slider", { name: "Anzahl" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Anzahl" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Drehung" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Kontur" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Titel" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Versatz" })).toBeTruthy();
    expect(screen.queryByText("Intern")).toBeNull();
    expect(screen.queryByText("Konturfarbe")).toBeNull();
  });

  it("links help texts via aria-describedby", () => {
    renderEditor();
    const slider = screen.getByRole("slider", { name: "Deckkraft" });
    const describedBy = slider.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Wie stark die Formen decken",
    );
  });
});

describe("slider", () => {
  it("steps with arrows, 10 steps with Shift, jumps with Home/End", async () => {
    const { user } = renderEditor();
    const slider = screen.getByRole("slider", { name: "Anzahl" });
    slider.focus();
    await user.keyboard("{ArrowRight}");
    expect(params().count).toBe(11);
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(params().count).toBe(21);
    await user.keyboard("{End}");
    expect(params().count).toBe(50);
    expect(slider.getAttribute("aria-valuenow")).toBe("50");
  });

  it("announces the unit in aria-valuetext", () => {
    renderEditor();
    expect(screen.getByRole("slider", { name: "Drehung" }).getAttribute("aria-valuetext")).toBe(
      "0°",
    );
  });

  it("double-click resets to the default", async () => {
    const { user } = renderEditor();
    act(() => store.getState().setParam("count", 33));
    await user.dblClick(screen.getByRole("slider", { name: "Anzahl" }));
    expect(params().count).toBe(10);
  });

  it("commits after each key press, so every keyboard step is undoable on its own", async () => {
    const { user } = renderEditor();
    screen.getByRole("slider", { name: "Anzahl" }).focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(store.getState().past).toHaveLength(3);
    act(() => store.getState().undo());
    expect(params().count).toBe(12);
  });
});

describe("number field", () => {
  it("applies typed values in range, clamps on blur, Shift+Arrow steps by 10", async () => {
    const { user } = renderEditor();
    const input = screen.getByRole("textbox", { name: "Anzahl" });
    await user.clear(input);
    await user.type(input, "25");
    expect(params().count).toBe(25);
    await user.clear(input);
    await user.type(input, "999");
    expect(params().count).toBe(9);
    await user.tab();
    expect(params().count).toBe(50);
    expect((input as HTMLInputElement).value).toBe("50");
    input.focus();
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(params().count).toBe(40);
    await user.keyboard("{ArrowUp}");
    expect(params().count).toBe(41);
  });

  it("accepts a decimal comma and marks garbage as invalid", async () => {
    const { user } = renderEditor();
    const input = screen.getByRole("textbox", { name: "Versatz" });
    await user.clear(input);
    await user.type(input, "2,5");
    expect(params().offset).toBe(2.5);
    await user.clear(input);
    await user.type(input, "abc");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await user.tab();
    expect(params().offset).toBe(2.5);
    expect((input as HTMLInputElement).value).toBe("2.5");
  });
});

describe("choices and switches", () => {
  it("segmented control selects an option and never deselects", async () => {
    const { user } = renderEditor();
    const group = screen.getByRole("radiogroup", { name: "Form" });
    const square = within(group).getByRole("radio", { name: "square" });
    await user.click(square);
    expect(params().shape).toBe("square");
    await user.click(square);
    expect(params().shape).toBe("square");
  });

  it("select lists large enums (inside Advanced)", async () => {
    const { user } = renderEditor();
    await user.click(screen.getByText("Stil"));
    await user.click(screen.getByText("Erweitert"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Mischmodus" }), "overlay");
    expect(params().blend).toBe("overlay");
  });

  it("switch toggles and reveals dependent controls (visibleWhen)", async () => {
    const { user } = renderEditor();
    await user.click(screen.getByRole("switch", { name: "Kontur" }));
    expect(params().outline).toBe(true);
    expect(screen.getByText("Konturfarbe")).toBeTruthy();
  });

  it("text field updates as one undo step while typing", async () => {
    const { user } = renderEditor();
    const input = screen.getByRole("textbox", { name: "Titel" });
    await user.type(input, "!!");
    expect(params().title).toBe("Hello!!");
    expect(store.getState().past).toHaveLength(1);
  });
});

describe("locks", () => {
  it("toggles a lock per param with aria-pressed", async () => {
    const { user } = renderEditor();
    const lock = screen.getByRole("button", { name: "Anzahl sperren" });
    expect(lock.getAttribute("aria-pressed")).toBe("false");
    await user.click(lock);
    expect(lock.getAttribute("aria-pressed")).toBe("true");
    expect(store.getState().locks.has("count")).toBe(true);
    store.getState().newVariant();
    expect(params().count).toBe(fixtureDefaults.count);
  });

  it("shows no lock for lockable: false params", () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: "Fixiert sperren" })).toBeNull();
    expect(screen.getByRole("button", { name: "Kontur sperren" })).toBeTruthy();
  });

  it("ControlPanel without onToggleLock shows no locks", () => {
    renderWithIntl(
      <ControlPanel
        tool={fixtureTool}
        params={fixtureDefaults}
        locks={new Set()}
        onChange={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /sperren/ })).toBeNull();
  });
});

describe("colors", () => {
  it("background picker edits the hex value and validates input", async () => {
    const { user } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Hintergrund #ffffff" }));
    const hex = await screen.findByRole("textbox", { name: "HEX-Wert" });
    await user.clear(hex);
    await user.type(hex, "#12");
    expect(screen.getByRole("alert").textContent).toBe("Gib einen HEX-Wert wie #1e90ff ein.");
    await user.type(hex, "3456");
    expect(params().background).toBe("#123456");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("native color input applies lower-case hex", async () => {
    const { user } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Hintergrund #ffffff" }));
    const picker = await screen.findByLabelText("Farbe wählen");
    // user-event cannot drive <input type=color>; fire the change directly.
    fireEvent.change(picker, { target: { value: "#AABBCC" } });
    expect(params().background).toBe("#aabbcc");
  });

  it("background switches to transparent and back to the last colour", async () => {
    const { user } = renderEditor();
    act(() => store.getState().setParam("background", "#00ff00"));
    const transparent = screen.getByRole("switch", { name: "Transparent" });
    await user.click(transparent);
    expect(params().background).toBe("transparent");
    expect(screen.queryByRole("button", { name: /^Hintergrund #/ })).toBeNull();
    await user.click(transparent);
    expect(params().background).toBe("#00ff00");
  });

  it("palette adds, reorders and removes colours within the schema limits", async () => {
    const { user } = renderEditor();
    const list = screen.getByRole("list", { name: "Palette" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4); // 3 swatches + add

    await user.click(within(list).getByRole("button", { name: "Farbe hinzufügen" }));
    expect(params().palette).toEqual(["#1e90ff", "#ff6347", "#ffd700", "#ffd700"]);

    await user.click(within(list).getByRole("button", { name: "Farbe 1 von 4, #1e90ff" }));
    await user.click(await screen.findByRole("button", { name: "Nach rechts schieben" }));
    expect(params().palette).toEqual(["#ff6347", "#1e90ff", "#ffd700", "#ffd700"]);
    expect(screen.getByRole("button", { name: "Nach links schieben" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(screen.getByRole("button", { name: "Farbe entfernen" }));
    expect(params().palette).toEqual(["#1e90ff", "#ffd700", "#ffd700"]);
  });

  it("palette cannot shrink below the minimum or grow above the maximum", async () => {
    const { user } = renderEditor();
    act(() => store.getState().setParam("palette", ["#000000", "#ffffff"]));
    await user.click(screen.getByRole("button", { name: "Farbe 1 von 2, #000000" }));
    expect(
      (await screen.findByRole("button", { name: "Farbe entfernen" })).hasAttribute("disabled"),
    ).toBe(true);
    await user.keyboard("{Escape}");
    act(() =>
      store.getState().setParam(
        "palette",
        Array.from({ length: 10 }, () => "#000000"),
      ),
    );
    expect(screen.queryByRole("button", { name: "Farbe hinzufügen" })).toBeNull();
  });
});
