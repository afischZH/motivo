import { registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import de from "../messages/de.json";
import en from "../messages/en.json";
import { TASK_IDS, TASK_TOOLS, taskTools } from "./tasks";

describe("tasks", () => {
  it.each(TASK_IDS)("%s lists only registered tools, at least three, each once", (task) => {
    const ids = TASK_TOOLS[task];
    for (const id of ids) expect(registry.get(id), id).toBeDefined();
    expect(new Set(ids).size).toBe(ids.length);
    expect(taskTools(task).length).toBeGreaterThanOrEqual(3);
  });

  it.each(TASK_IDS)("%s has texts in German and English", (task) => {
    for (const messages of [de, en]) {
      const texts = (messages.Tasks as Record<string, Record<string, string>>)[task];
      for (const key of ["name", "lead", "metaTitle", "metaDescription"]) {
        expect(texts?.[key], `${task}.${key}`).toBeTruthy();
      }
    }
  });
});
