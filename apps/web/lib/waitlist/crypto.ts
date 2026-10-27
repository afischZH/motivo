/**
 * Tokens and hashes for the waitlist, with Web Crypto only (Workers and
 * Node alike). Plain tokens leave the server only inside the e-mail; the
 * database stores their SHA-256. Client IPs are never stored: the rate limit
 * uses an HMAC of the IP keyed with a server secret and the current UTC day,
 * so the value cannot be reversed or linked across days.
 */

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes as base64url (43 characters). */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** SHA-256 as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/** HMAC-SHA-256 as lowercase hex. */
export async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

/**
 * Rate-limit key for a client IP: HMAC(secret, "<UTC day>|<ip>"). The secret
 * is derived from the server's Supabase key with a fixed label, so no extra
 * variable is needed and the key is useless outside this purpose.
 */
export async function rateLimitKey(secret: string, ip: string, now: Date): Promise<string> {
  const day = now.toISOString().slice(0, 10);
  return hmacHex(`motivo-waitlist-rate-limit:${secret}`, `${day}|${ip}`);
}

/**
 * The client IP as Cloudflare reports it, or null (local runs). Only
 * `CF-Connecting-IP` is trusted: on Workers it is set by Cloudflare and
 * cannot be forged by the client, unlike `X-Forwarded-For`.
 */
export function clientIp(headers: Headers): string | null {
  const ip = headers.get("cf-connecting-ip")?.trim();
  return ip && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}
