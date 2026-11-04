import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CONTENT_SECURITY_POLICY, staticHeadersFile } from "./security-headers";

describe("security headers", () => {
  it("public/_headers matches the module (regenerate it when this fails)", () => {
    const file = readFileSync(
      fileURLToPath(new URL("../public/_headers", import.meta.url)),
      "utf8",
    );
    expect(file).toBe(staticHeadersFile());
  });

  it("allows no third-party origins", () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:/);
  });
});
