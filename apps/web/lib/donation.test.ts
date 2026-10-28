import { describe, expect, it } from "vitest";

import { parseDonationUrl } from "./donation";

describe("parseDonationUrl", () => {
  it("is null when unset or blank", () => {
    expect(parseDonationUrl(undefined)).toBeNull();
    expect(parseDonationUrl("")).toBeNull();
    expect(parseDonationUrl("   ")).toBeNull();
  });

  it("accepts absolute https URLs", () => {
    expect(parseDonationUrl("https://donate.example/motivo")).toBe("https://donate.example/motivo");
    expect(parseDonationUrl(" https://donate.example/?ref=motivo ")).toBe(
      "https://donate.example/?ref=motivo",
    );
  });

  it("rejects other schemes, relative URLs and credentials", () => {
    for (const raw of [
      "http://donate.example/motivo",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//donate.example/motivo",
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
