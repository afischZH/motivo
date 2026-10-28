import { describe, expect, it } from "vitest";

import { parseDonationUrl } from "./donation";

describe("parseDonationUrl", () => {
  it("is null when unset or blank", () => {
    expect(parseDonationUrl(undefined)).toBeNull();
    expect(parseDonationUrl("")).toBeNull();
    expect(parseDonationUrl("   ")).toBeNull();
  });

  it("accepts absolute https URLs", () => {
    expect(parseDonationUrl("https://donate.example/musterli")).toBe(
      "https://donate.example/musterli",
    );
    expect(parseDonationUrl(" https://donate.example/?ref=musterli ")).toBe(
      "https://donate.example/?ref=musterli",
    );
  });

  it("rejects other schemes, relative URLs and credentials", () => {
    for (const raw of [
      "http://donate.example/musterli",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//donate.example/musterli",
      "/unterstuetzen",
      "donate.example",
      "https://user:secret@donate.example/",
      "https://user@donate.example/",
      "ftp://donate.example/",
    ]) {
      expect(parseDonationUrl(raw), raw).toBeNull();
    }
  });
});
