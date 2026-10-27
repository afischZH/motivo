import { afterEach, describe, expect, it } from "vitest";
import {
  EDITOR_TILE_ATTRIBUTE,
  isEditableTarget,
  isShortcutBlocked,
  matchShortcut,
  resolveShortcut,
  type ShortcutAction,
  type ShortcutKeyEvent,
} from "./shortcuts";

const key = (k: string, mods: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

/** Mounts markup and returns the element marked with `data-target`. */
function mount(html: string): Element {
  document.body.innerHTML = html;
  const el = document.querySelector("[data-target]");
  if (!el) throw new Error("no [data-target] in markup");
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("matchShortcut", () => {
  it.each<[string, ShortcutKeyEvent, ShortcutAction | null]>([
    ["Space", key(" "), "newVariant"],
    ["legacy Spacebar", key("Spacebar"), "newVariant"],
    ["Ctrl+Z", key("z", { ctrlKey: true }), "undo"],
    ["Cmd+Z", key("z", { metaKey: true }), "undo"],
    ["Shift+Cmd+Z (key reported upper case)", key("Z", { metaKey: true, shiftKey: true }), "redo"],
    ["Shift+Ctrl+Z", key("Z", { ctrlKey: true, shiftKey: true }), "redo"],
    ["Ctrl+Y", key("y", { ctrlKey: true }), "redo"],
    ["Cmd+Y is not redo", key("y", { metaKey: true }), null],
    ["Ctrl+E", key("e", { ctrlKey: true }), "export"],
    ["ArrowLeft", key("ArrowLeft"), "previousVariant"],
    ["ArrowRight", key("ArrowRight"), "nextVariant"],
    ["0", key("0"), "zoomFit"],
    ["1", key("1"), "zoom100"],
    ["? with Shift", key("?", { shiftKey: true }), "help"],
    ["Shift+Space", key(" ", { shiftKey: true }), null],
    ["Shift+ArrowLeft", key("ArrowLeft", { shiftKey: true }), null],
    ["Ctrl+Space", key(" ", { ctrlKey: true }), null],
    ["Alt+Space", key(" ", { altKey: true }), null],
    ["AltGr (Ctrl+Alt)+Z", key("z", { ctrlKey: true, altKey: true }), null],
    ["Ctrl+0 (browser zoom)", key("0", { ctrlKey: true }), null],
    ["plain z", key("z"), null],
  ])("%s", (_, event, expected) => {
    expect(matchShortcut(event)).toBe(expected);
  });
});

describe("isShortcutBlocked", () => {
  const ALL: ShortcutAction[] = [
    "newVariant",
    "undo",
    "redo",
    "previousVariant",
    "nextVariant",
    "zoomFit",
    "zoom100",
    "help",
  ];

  it("allows everything on the page body and plain elements", () => {
    for (const action of ALL) {
      expect(isShortcutBlocked(document.body, action)).toBe(false);
      expect(isShortcutBlocked(mount("<div data-target></div>"), action)).toBe(false);
    }
    expect(isShortcutBlocked(null, "newVariant")).toBe(false);
    expect(isShortcutBlocked(window, "newVariant")).toBe(false);
  });

  it.each([
    ["text input", '<input data-target type="text">'],
    ["input without type", "<input data-target>"],
    ["number input", '<input data-target type="number">'],
    ["search input", '<input data-target type="search">'],
    ["textarea", "<textarea data-target></textarea>"],
    ["select", "<select data-target><option>a</option></select>"],
    ["contenteditable", '<div data-target contenteditable="true"></div>'],
    ["inside contenteditable", "<div contenteditable><span data-target>x</span></div>"],
    ["role textbox", '<div data-target role="textbox"></div>'],
    ["role combobox", '<div data-target role="combobox"></div>'],
  ])("blocks every shortcut in a %s", (_, html) => {
    const el = mount(html);
    for (const action of ALL) expect(isShortcutBlocked(el, action), action).toBe(true);
  });

  it("does not treat contenteditable=false as editable", () => {
    const el = mount('<div contenteditable="false"><span data-target>x</span></div>');
    expect(isShortcutBlocked(el, "newVariant")).toBe(false);
  });

  it.each([
    ["button", "<button data-target>b</button>"],
    ["checkbox", '<input data-target type="checkbox">'],
    ["radio", '<input data-target type="radio">'],
    ["range", '<input data-target type="range">'],
    ["colour input", '<input data-target type="color">'],
    ["summary", "<details><summary data-target>s</summary></details>"],
    ["role switch", '<button data-target role="switch"></button>'],
    ["role tab", '<div data-target role="tab" tabindex="0"></div>'],
    ["role option", '<div data-target role="option" tabindex="0"></div>'],
  ])("lets Space activate a %s, other shortcuts still work", (_, html) => {
    const el = mount(html);
    expect(isShortcutBlocked(el, "newVariant")).toBe(true);
    expect(isShortcutBlocked(el, "undo")).toBe(false);
    expect(isShortcutBlocked(el, "help")).toBe(false);
  });

  it("keeps arrows for variants on a plain button", () => {
    const el = mount("<button data-target>b</button>");
    expect(isShortcutBlocked(el, "previousVariant")).toBe(false);
    expect(isShortcutBlocked(el, "nextVariant")).toBe(false);
  });

  it.each([
    ["range input", '<input data-target type="range">'],
    ["radio input", '<input data-target type="radio">'],
    ["slider thumb", '<span data-target role="slider" tabindex="0"></span>'],
    ["radio item", '<div role="radiogroup"><button data-target role="radio"></button></div>'],
    ["segmented control item", '<div role="radiogroup"><button data-target></button></div>'],
    ["tab", '<div role="tablist"><button data-target role="tab"></button></div>'],
    ["listbox option", '<div role="listbox"><div data-target role="option"></div></div>'],
    ["toolbar button", '<div role="toolbar"><button data-target></button></div>'],
    ["menu item", '<div role="menu"><div data-target role="menuitem"></div></div>'],
  ])("leaves arrows to a %s", (_, html) => {
    const el = mount(html);
    expect(isShortcutBlocked(el, "previousVariant")).toBe(true);
    expect(isShortcutBlocked(el, "nextVariant")).toBe(true);
  });

  it("lets Space create a new variant on preset and filmstrip tiles", () => {
    const el = mount(`<button data-target ${EDITOR_TILE_ATTRIBUTE}>tile</button>`);
    expect(isShortcutBlocked(el, "newVariant")).toBe(false);
  });

  it("lets a slider use Space for a new variant, as it has no native meaning there", () => {
    const el = mount('<span data-target role="slider" tabindex="0"></span>');
    expect(isShortcutBlocked(el, "newVariant")).toBe(false);
  });

  it.each([
    ["native dialog", "<dialog open><button data-target>x</button></dialog>"],
    ["role dialog (popover)", '<div role="dialog"><div data-target tabindex="0"></div></div>'],
    ["alertdialog", '<div role="alertdialog"><div data-target tabindex="0"></div></div>'],
  ])("blocks every shortcut inside a %s", (_, html) => {
    const el = mount(html);
    for (const action of ALL) expect(isShortcutBlocked(el, action), action).toBe(true);
  });
});

describe("isEditableTarget", () => {
  it("treats button-like inputs as not editable", () => {
    for (const type of ["button", "submit", "checkbox", "radio", "range", "color", "file"]) {
      expect(isEditableTarget(mount(`<input data-target type="${type}">`)), type).toBe(false);
    }
  });
});

describe("resolveShortcut", () => {
  const event = (k: string, target: EventTarget | null, extra: object = {}) => ({
    ...key(k),
    target,
    ...extra,
  });

  it("combines key matching and focus rules", () => {
    const input = mount('<input data-target type="text">');
    expect(resolveShortcut(event(" ", document.body))).toBe("newVariant");
    expect(resolveShortcut(event(" ", input))).toBeNull();
  });

  it("ignores events that were already handled or are part of an IME composition", () => {
    expect(resolveShortcut(event(" ", document.body, { defaultPrevented: true }))).toBeNull();
    expect(resolveShortcut(event(" ", document.body, { isComposing: true }))).toBeNull();
  });
});
