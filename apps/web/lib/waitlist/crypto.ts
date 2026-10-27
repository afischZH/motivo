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
  return hmacHex(`motivo-waitlist-rate-limit:${secret}`, `${day}|${rateLimitSubject(ip)}`);
}

/** The eight 16-bit groups of an IPv6 address, or null when malformed. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%", 1)[0] ?? "";
  // Embedded IPv4 in the last 32 bits (e.g. ::ffff:192.0.2.1).
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((o) => o > 255)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = octets;
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0] ?? "");
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/**
 * What the per-IP limit counts. IPv4 addresses as they are. IPv6 by their
 * /64 prefix: one connection usually gets a whole /64, so counting single
 * addresses would let one client rotate through billions of them. IPv4-mapped
 * IPv6 addresses count as the IPv4 address.
 */
export function rateLimitSubject(ip: string): string {
  if (!ip.includes(":")) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (mapped) {
    const [hi = 0, lo = 0] = groups.slice(6);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
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
