/**
 * Every preset of every registered tool has a stored snapshot (seed 1, see
 * `describePresetSnapshots` in tools.test.ts), and no snapshot belongs to a
 * preset that is gone. Vitest writes missing snapshots outside CI and only
 * warns about obsolete ones; this makes both a failure everywhere.
 * Part of the consistency test (M5b-AP02, tool-consistency.test.ts); it
 * lives in the web app because tool-registry has no Node types.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

const SNAPSHOT_FILE = fileURLToPath(
  new URL(
    "../../../packages/tool-registry/src/tools/__snapshots__/tools.test.ts.snap",
    import.meta.url,
  ),
);
const tools = registry.list();
const EXTRA_EXPORTS_TEST = "extra exports of every preset";

/** `tool id > test name` of every stored preset snapshot. */
const stored = new Set(
  [...readFileSync(SNAPSHOT_FILE, "utf8").matchAll(/^exports\[`preset snapshots: (.+) 1`\]/gm)].map(
    (m) => m[1] ?? "",
  ),
);

describe("preset snapshot coverage", () => {
  it.each(tools.map((t) => [t.id, t] as const))(
    "%s has a stored snapshot for every preset",
    (id, tool) => {
      const missing = tool.presets.map((p) => `${id} > ${p.id}`).filter((k) => !stored.has(k));
      expect(missing).toEqual([]);
      const extras = (tool.extraExports ?? []).length > 0;
      expect(stored.has(`${id} > ${EXTRA_EXPORTS_TEST}`)).toBe(extras);
    },
  );

  it("stores no snapshot of a removed tool or preset", () => {
    const expected = new Set(
      tools.flatMap((t) => [
        ...t.presets.map((p) => `${t.id} > ${p.id}`),
        `${t.id} > ${EXTRA_EXPORTS_TEST}`,
      ]),
    );
    expect([...stored].filter((k) => !expected.has(k))).toEqual([]);
  });
});
