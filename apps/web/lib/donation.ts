/**
 * Link to the external donation provider (docs/PRODUCT.md 6.1). No payment
 * data on our domain. When the URL is a Ko-fi page, the home page also shows
 * Ko-fi's floating donate widget (`telemetry/config.ts` `kofiPageId`, which
 * also opens the CSP for it).
 *
 * The URL comes from `NEXT_PUBLIC_DONATION_URL` at build time (spelled out
 * so Next inlines it). Only absolute https URLs without credentials are
 * accepted; anything else counts as unset and the support page shows its
 * "link follows soon" state instead of a broken button.
 */

/** The validated donation URL, or null when unset or invalid. */
export function parseDonationUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname === "") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url.href;
}

/** The donation URL of this build, or null. */
export function donationUrl(): string | null {
  return parseDonationUrl(process.env.NEXT_PUBLIC_DONATION_URL);
}
