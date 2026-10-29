import { afterEach, describe, expect, it, vi } from "vitest";

import {
  availableEditorCommands,
  publishEditorCommands,
  runEditorCommand,
  subscribeEditorCommands,
} from "./command-bridge";

describe("command bridge", () => {
  let withdraw: (() => void) | undefined;
  afterEach(() => withdraw?.());

  it("lists the published actions in palette order and runs them", () => {
    const exportFn = vi.fn();
    const undo = vi.fn();
    withdraw = publishEditorCommands({ undo, export: exportFn });
    expect(availableEditorCommands()).toEqual(["export", "undo"]);
    expect(runEditorCommand("export")).toBe(true);
    expect(exportFn).toHaveBeenCalledOnce();
    expect(runEditorCommand("save")).toBe(false);
  });

  it("notifies on publish and withdraw, and an old editor cannot withdraw a newer one", () => {
    const listener = vi.fn();
    const stop = subscribeEditorCommands(listener);
    const first = publishEditorCommands({ export: () => undefined });
    withdraw = publishEditorCommands({ help: () => undefined });
    first();
    expect(availableEditorCommands()).toEqual(["help"]);
    withdraw();
    withdraw = undefined;
    expect(availableEditorCommands()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
  });
});
