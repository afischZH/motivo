/**
 * Founders waitlist API, end to end: the real handlers and Supabase client,
 * with `fetch` routed to the real migration in PGlite (emulated Supabase
 * roles, `@motivo/db/testing`), a fake Resend and a fake Turnstile. Proves
 * the feature is off without configuration and works with it.
 */
import { WAITLIST_DB_LIMITS } from "@motivo/db";
import { asRole, createTestDatabase, type TestDatabase } from "@motivo/db/testing";
import type { Messages } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import de from "@/messages/de.json";
import en from "@/messages/en.json";

import { waitlistConfig, type WaitlistConfig, type WaitlistEnv } from "./config";
import { COUNT_CACHE_SECONDS, FOUNDERS_SEATS, TOKEN_PATTERN } from "./constants";
import { clientIp, rateLimitKey, sha256Hex } from "./crypto";
import { RESEND_ENDPOINT, buildConfirmationEmail, escapeHtml } from "./email";
import {
  handleConfirm,
  handleCount,
  handleSignup,
  handleUnsubscribe,
  resetCountCache,
  type WaitlistDeps,
} from "./handlers";
import { supabaseStore } from "./supabase";
import { TURNSTILE_SITEVERIFY } from "./turnstile";

const SUPABASE_URL = "https://project.supabase.co";
const KEY = "sb_secret_test_key_never_logged";
const ENV: WaitlistEnv = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: KEY,
  RESEND_API_KEY: "re_test_key",
  WAITLIST_FROM_EMAIL: "Motivo <warteliste@example.ch>",
};
const BASE = new URL("https://motivo.example");
const ORIGIN = "http://localhost:3100";

let db: TestDatabase;

interface SentMail {
  headers: Record<string, string>;
  body: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    headers: Record<string, string>;
  };
}

interface Harness {
  deps: WaitlistDeps;
  mails: SentMail[];
  logs: string[];
  turnstileBodies: Record<string, unknown>[];
  supabaseHeaders: Record<string, string>[];
  rpcCalls: string[];
  /** Runs the work deferred until after the response (the e-mail). */
  flush(): Promise<void>;
  failNext: { supabase: boolean; resend: boolean };
}

function harness(options: { env?: WaitlistEnv; config?: WaitlistConfig | null; now?: Date } = {}) {
  const mails: SentMail[] = [];
  const logs: string[] = [];
  const turnstileBodies: Record<string, unknown>[] = [];
  const supabaseHeaders: Record<string, string>[] = [];
  const rpcCalls: string[] = [];
  const deferred: (() => Promise<void>)[] = [];
  const failNext = { supabase: false, resend: false };
  let now = options.now ?? new Date("2026-10-27T12:00:00Z");

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.startsWith(`${SUPABASE_URL}/rest/v1/rpc/`)) {
      supabaseHeaders.push(headers);
      if (failNext.supabase) {
        failNext.supabase = false;
        return new Response('{"message":"boom for ada@example.com"}', { status: 500 });
      }
      if (headers.apikey !== KEY) return new Response("{}", { status: 401 });
      const name = url.slice(`${SUPABASE_URL}/rest/v1/rpc/`.length);
      if (!/^waitlist_[a-z_]+$/.test(name)) return new Response("{}", { status: 404 });
      rpcCalls.push(name);
      const args = JSON.parse(body) as Record<string, unknown>;
      const keys = Object.keys(args);
      const sql = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`;
      const result = await asRole(db, "service_role", () =>
        db.query<{ result: unknown }>(
          sql,
          keys.map((k) => args[k]),
        ),
      );
      return new Response(JSON.stringify(result.rows[0]?.result ?? null), { status: 200 });
    }
    if (url === RESEND_ENDPOINT) {
      if (failNext.resend) {
        failNext.resend = false;
        return new Response('{"message":"rejected"}', { status: 422 });
      }
      mails.push({ headers, body: JSON.parse(body) as SentMail["body"] });
      return new Response('{"id":"mail-1"}', { status: 200 });
    }
    if (url === TURNSTILE_SITEVERIFY) {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      turnstileBodies.push(parsed);
      return Response.json({ success: parsed.response === "good-token", action: "waitlist" });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const config = options.config !== undefined ? options.config : waitlistConfig(options.env ?? ENV);
  const deps: WaitlistDeps = {
    config,
    baseUrl: BASE,
    fetch: fakeFetch,
    now: () => now,
    messages: async (locale) => (locale === "de" ? de : en) as unknown as Messages,
    defer: (task) => deferred.push(task),
    log: (message) => logs.push(message),
  };
  const h: Harness = {
    deps,
    mails,
    logs,
    turnstileBodies,
    supabaseHeaders,
    rpcCalls,
    failNext,
    async flush() {
      while (deferred.length > 0) await deferred.shift()?.();
    },
  };
  return Object.assign(h, {
    setNow(date: Date) {
      now = date;
    },
  });
}

function signupRequest(
  body: Record<string, unknown>,
  init: { headers?: Record<string, string>; raw?: string } = {},
): Request {
  return new Request(`${ORIGIN}/api/waitlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init.headers },
    body: init.raw ?? JSON.stringify(body),
  });
}

const valid = (email = "Ada@Example.com", locale = "de") => ({ email, locale, consent: true });

/** The confirmation URL from a mail's plain text. */
function confirmUrl(mail: SentMail): URL {
  const line = mail.body.text.split("\n").find((l) => l.includes("/api/waitlist/confirm?"));
  if (!line) throw new Error("no confirm link");
  return new URL(line.trim());
}

function unsubscribeToken(mail: SentMail): string {
  const header = mail.body.headers["List-Unsubscribe"] ?? "";
  const url = new URL(header.slice(1, -1));
  return url.searchParams.get("token") ?? "";
}

async function confirmedCount(): Promise<number> {
  const result = await db.query<{ n: number }>(
    "select count(*)::int as n from public.waitlist_signups where status = 'confirmed'",
  );
  return result.rows[0]?.n ?? -1;
}

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("truncate public.waitlist_signups, public.waitlist_rate_limits");
  resetCountCache();
});

describe("configuration", () => {
  it("is off unless every required variable is set", () => {
    expect(waitlistConfig({})).toBeNull();
    for (const key of Object.keys(ENV) as (keyof WaitlistEnv)[]) {
      expect(waitlistConfig({ ...ENV, [key]: "" }), key).toBeNull();
      expect(waitlistConfig({ ...ENV, [key]: undefined }), key).toBeNull();
    }
    expect(waitlistConfig(ENV)).toMatchObject({ supabaseUrl: SUPABASE_URL, turnstileSecret: null });
    const turnstile = {
      TURNSTILE_SECRET_KEY: "1x0000",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    };
    expect(waitlistConfig({ ...ENV, ...turnstile })?.turnstileSecret).toBe("1x0000");
  });

  it("stays off when only one Turnstile key is set (e.g. preview builds)", () => {
    expect(waitlistConfig({ ...ENV, TURNSTILE_SECRET_KEY: "1x0000" })).toBeNull();
    expect(
      waitlistConfig({ ...ENV, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }),
    ).toBeNull();
    // next dev never loads Turnstile, so a secret there switches the waitlist off.
    expect(
      waitlistConfig({
        ...ENV,
        TURNSTILE_SECRET_KEY: "1x0000",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        NODE_ENV: "development",
      }),
    ).toBeNull();
  });

  it("accepts only https (or a local Supabase) and a single plain sender", () => {
    expect(waitlistConfig({ ...ENV, SUPABASE_URL: "http://project.supabase.co" })).toBeNull();
    expect(waitlistConfig({ ...ENV, SUPABASE_URL: "https://u:p@project.supabase.co" })).toBeNull();
    expect(waitlistConfig({ ...ENV, SUPABASE_URL: "http://127.0.0.1:54321" })?.supabaseUrl).toBe(
      "http://127.0.0.1:54321",
    );
    expect(waitlistConfig({ ...ENV, SUPABASE_URL: `${SUPABASE_URL}/` })?.supabaseUrl).toBe(
      SUPABASE_URL,
    );
    expect(waitlistConfig({ ...ENV, WAITLIST_FROM_EMAIL: "a@b.ch\r\nBcc: x@y.z" })).toBeNull();
    expect(waitlistConfig({ ...ENV, WAITLIST_FROM_EMAIL: "a@b.ch, c@d.ch" })).toBeNull();
    expect(waitlistConfig({ ...ENV, WAITLIST_FROM_EMAIL: "warteliste@example.ch" })).not.toBeNull();
  });
});

describe("feature switched off", () => {
  const off = () => harness({ config: null });

  it("rejects sign-ups and unsubscribes with 503 and touches nothing", async () => {
    const h = off();
    const signup = await handleSignup(signupRequest(valid()), h.deps);
    expect(signup.status).toBe(503);
    expect(await signup.json()).toEqual({ error: "disabled" });
    const unsubscribe = await handleUnsubscribe(
      new Request(`${ORIGIN}/api/waitlist/unsubscribe?token=${"a".repeat(43)}`, { method: "POST" }),
      h.deps,
    );
    expect(unsubscribe.status).toBe(503);
    expect(h.rpcCalls).toEqual([]);
  });

  it("reports the counter as off, cacheable", async () => {
    const response = await handleCount(off().deps);
    expect(await response.json()).toEqual({ enabled: false });
    expect(response.headers.get("cache-control")).toContain(`max-age=${COUNT_CACHE_SECONDS}`);
  });

  it("sends confirmation links to the error page", async () => {
    const response = await handleConfirm(
      new Request(`${ORIGIN}/api/waitlist/confirm?token=${"a".repeat(43)}&lang=en`),
      off().deps,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/en/founders-waitlist/error`);
  });
});

describe("double opt-in, end to end", () => {
  it("signs up, mails a link, confirms once, counts, and unsubscribes", async () => {
    const h = harness();
    const response = await handleSignup(signupRequest(valid()), h.deps);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "pending" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    // The mail goes out after the response.
    expect(h.mails).toHaveLength(0);
    await h.flush();
    expect(h.mails).toHaveLength(1);

    const mail = h.mails[0] as SentMail;
    expect(mail.body.to).toEqual(["ada@example.com"]);
    expect(mail.body.from).toBe("Motivo <warteliste@example.ch>");
    expect(mail.body.subject).toBe(de.WaitlistEmail.subject);
    expect(mail.headers.authorization).toBe("Bearer re_test_key");
    expect(mail.headers["idempotency-key"]).toMatch(/^waitlist-confirm\/[0-9a-f]{64}$/);
    expect(mail.body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    const link = confirmUrl(mail);
    expect(link.origin).toBe(BASE.origin);
    expect(link.searchParams.get("lang")).toBe("de");
    const token = link.searchParams.get("token") ?? "";
    expect(token).toMatch(TOKEN_PATTERN);
    // Only the hash is stored.
    const stored = await db.query<{ confirm_token_hash: string }>(
      "select confirm_token_hash from public.waitlist_signups",
    );
    expect(stored.rows[0]?.confirm_token_hash).toBe(await sha256Hex(token));
    expect(JSON.stringify(stored.rows)).not.toContain(token);

    expect(await (await handleCount(h.deps)).json()).toEqual({
      enabled: true,
      confirmed: 0,
      seats: FOUNDERS_SEATS,
    });

    const confirm = await handleConfirm(
      new Request(link.toString().replace(BASE.origin, ORIGIN)),
      h.deps,
    );
    expect(confirm.status).toBe(303);
    expect(confirm.headers.get("location")).toBe(`${ORIGIN}/de/founders-warteliste/bestaetigt`);
    expect(confirm.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await confirmedCount()).toBe(1);

    // Redirects stay on the host that served the link.
    const again = await handleConfirm(new Request(link.toString()), h.deps);
    expect(again.headers.get("location")).toBe(
      `${BASE.origin}/de/founders-warteliste/link-ungueltig`,
    );

    resetCountCache();
    expect(await (await handleCount(h.deps)).json()).toMatchObject({ confirmed: 1 });

    // RFC 8058 one-click: POST with the token in the query.
    const oneClick = await handleUnsubscribe(
      new Request(`${ORIGIN}/api/waitlist/unsubscribe?token=${unsubscribeToken(mail)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
      h.deps,
    );
    expect(oneClick.status).toBe(200);
    expect(await oneClick.json()).toEqual({ status: "unsubscribed" });
    expect(await confirmedCount()).toBe(0);
    const left = await db.query("select * from public.waitlist_signups where email is not null");
    expect(left.rows).toEqual([]);
  });

  it("writes the English mail for English sign-ups and links the English pages", async () => {
    const h = harness();
    await handleSignup(signupRequest(valid("bob@example.com", "en")), h.deps);
    await h.flush();
    const mail = h.mails[0] as SentMail;
    expect(mail.body.subject).toBe(en.WaitlistEmail.subject);
    expect(mail.body.text).toContain(
      "https://motivo.example/en/founders-waitlist/unsubscribe#token=",
    );
    expect(mail.body.text).toContain("https://motivo.example/en/privacy");
    const confirm = await handleConfirm(new Request(confirmUrl(mail).toString()), h.deps);
    expect(confirm.headers.get("location")).toBe(
      "https://motivo.example/en/founders-waitlist/confirmed",
    );
  });

  it("unsubscribes from the page with a JSON body", async () => {
    const h = harness();
    await handleSignup(signupRequest(valid()), h.deps);
    await h.flush();
    const token = unsubscribeToken(h.mails[0] as SentMail);
    const request = () =>
      new Request(`${ORIGIN}/api/waitlist/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    expect(await (await handleUnsubscribe(request(), h.deps)).json()).toEqual({
      status: "unsubscribed",
    });
    const second = await handleUnsubscribe(request(), h.deps);
    expect(second.status).toBe(404);
    expect(await second.json()).toEqual({ status: "invalid" });
    const malformed = await handleUnsubscribe(
      new Request(`${ORIGIN}/api/waitlist/unsubscribe?token=short`, { method: "POST" }),
      h.deps,
    );
    expect(malformed.status).toBe(400);
  });

  it("rejects malformed and expired confirmation tokens", async () => {
    const h = harness();
    const bad = await handleConfirm(
      new Request(`${ORIGIN}/api/waitlist/confirm?token=nope&lang=xx`),
      h.deps,
    );
    // Unknown language falls back to German.
    expect(bad.headers.get("location")).toBe(`${ORIGIN}/de/founders-warteliste/link-ungueltig`);
    expect(h.rpcCalls).toEqual([]);

    await handleSignup(signupRequest(valid()), h.deps);
    await h.flush();
    await db.query(
      "update public.waitlist_signups set token_expires_at = now() - interval '1 minute'",
    );
    const expired = await handleConfirm(
      new Request(confirmUrl(h.mails[0] as SentMail).toString()),
      h.deps,
    );
    expect(expired.headers.get("location")).toContain("/link-ungueltig");
    expect(await confirmedCount()).toBe(0);
  });
});

describe("privacy of the sign-up answer", () => {
  it("answers identically for new, pending and confirmed addresses, and mails only once", async () => {
    const h = harness();
    const answers: { status: number; body: string }[] = [];
    const ask = async (email: string) => {
      const response = await handleSignup(signupRequest(valid(email)), h.deps);
      answers.push({ status: response.status, body: await response.text() });
      await h.flush();
    };
    await ask("ada@example.com"); // new
    await ask("ADA@example.com"); // pending, cooldown
    await handleConfirm(new Request(confirmUrl(h.mails[0] as SentMail).toString()), h.deps);
    await ask("ada@example.com"); // confirmed
    await ask("new@example.com"); // new
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(h.mails.map((m) => m.body.to[0])).toEqual(["ada@example.com", "new@example.com"]);
  });

  it("never logs addresses, tokens, keys or backend bodies", async () => {
    const h = harness();
    h.failNext.supabase = true;
    const failed = await handleSignup(signupRequest(valid("ada@example.com")), h.deps);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
    h.failNext.resend = true;
    await handleSignup(signupRequest(valid("ada@example.com")), h.deps);
    await h.flush();
    expect(h.logs.length).toBeGreaterThanOrEqual(2);
    const all = h.logs.join("\n");
    expect(all).toContain("HTTP 500");
    expect(all).toContain("HTTP 422");
    for (const secret of ["ada@example.com", "ada", KEY, "re_test_key", "boom", "rejected"]) {
      expect(all).not.toContain(secret);
    }
  });
});

describe("validation", () => {
  it.each([
    ["invalid email", { ...valid(), email: "not-an-email" }],
    ["missing consent", { email: "a@example.com", locale: "de" }],
    ["consent false", { ...valid(), consent: false }],
    ["unknown locale", { ...valid(), locale: "xx" }],
    ["overlong email", { ...valid(), email: `${"a".repeat(250)}@example.com` }],
  ])("rejects %s with 400", async (_, body) => {
    const h = harness();
    const response = await handleSignup(signupRequest(body), h.deps);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid" });
    expect(h.rpcCalls).toEqual([]);
  });

  it("accepts JSON only, small bodies only", async () => {
    const h = harness();
    const form = await handleSignup(
      signupRequest(
        {},
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, raw: "email=a" },
      ),
      h.deps,
    );
    expect(form.status).toBe(415);
    const big = await handleSignup(signupRequest({ ...valid(), pad: "x".repeat(5000) }), h.deps);
    expect(big.status).toBe(413);
    const broken = await handleSignup(signupRequest({}, { raw: "{not json" }), h.deps);
    expect(broken.status).toBe(400);
  });

  it("answers a filled honeypot like a success and stores nothing", async () => {
    const h = harness();
    const response = await handleSignup(
      signupRequest({ ...valid(), website: "spam.example" }),
      h.deps,
    );
    expect(response.status).toBe(202);
    await h.flush();
    expect(h.rpcCalls).toEqual([]);
    expect(h.mails).toEqual([]);
  });
});

describe("Turnstile", () => {
  const env = {
    ...ENV,
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  };

  it("is required when the secret is set", async () => {
    const h = harness({ env });
    const missing = await handleSignup(signupRequest(valid()), h.deps);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "captcha" });
    const wrong = await handleSignup(signupRequest({ ...valid(), turnstileToken: "bad" }), h.deps);
    expect(wrong.status).toBe(400);
    expect(h.rpcCalls).toEqual([]);

    const ok = await handleSignup(
      signupRequest(
        { ...valid(), turnstileToken: "good-token" },
        { headers: { "CF-Connecting-IP": "203.0.113.7" } },
      ),
      h.deps,
    );
    expect(ok.status).toBe(202);
    const last = h.turnstileBodies.at(-1);
    expect(last).toMatchObject({ secret: "turnstile-secret", response: "good-token" });
    // The visitor's IP is not sent to Cloudflare.
    expect(last).not.toHaveProperty("remoteip");
  });

  it("is skipped without the secret", async () => {
    const h = harness();
    expect((await handleSignup(signupRequest(valid()), h.deps)).status).toBe(202);
    expect(h.turnstileBodies).toEqual([]);
  });
});

describe("rate limiting", () => {
  it("uses a daily HMAC of the IP, never the IP itself", async () => {
    const day1 = new Date("2026-10-27T10:00:00Z");
    const a = await rateLimitKey("secret", "203.0.113.7", day1);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await rateLimitKey("secret", "203.0.113.7", new Date("2026-10-27T23:59:00Z"))).toBe(a);
    expect(await rateLimitKey("secret", "203.0.113.7", new Date("2026-10-28T00:00:00Z"))).not.toBe(
      a,
    );
    expect(await rateLimitKey("other", "203.0.113.7", day1)).not.toBe(a);
    expect(await rateLimitKey("secret", "203.0.113.8", day1)).not.toBe(a);
  });

  it("trusts only CF-Connecting-IP", () => {
    expect(clientIp(new Headers({ "CF-Connecting-IP": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(new Headers({ "X-Forwarded-For": "203.0.113.7" }))).toBeNull();
    expect(clientIp(new Headers({ "CF-Connecting-IP": "<script>" }))).toBeNull();
  });

  it("answers 429 after the hourly budget and stores no IP", async () => {
    const h = harness();
    const ip = { "CF-Connecting-IP": "203.0.113.7" };
    for (let i = 0; i < WAITLIST_DB_LIMITS.ipRequestsPerHour; i++) {
      const r = await handleSignup(
        signupRequest(valid(`u${i}@example.com`), { headers: ip }),
        h.deps,
      );
      expect(r.status).toBe(202);
    }
    const limited = await handleSignup(
      signupRequest(valid("late@example.com"), { headers: ip }),
      h.deps,
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    const dump = JSON.stringify((await db.query("select * from public.waitlist_rate_limits")).rows);
    expect(dump).not.toContain("203.0.113.7");
  });
});

describe("failed mail", () => {
  it("lets the person retry at once instead of waiting for the cooldown", async () => {
    const h = harness();
    h.failNext.resend = true;
    await handleSignup(signupRequest(valid()), h.deps);
    await h.flush();
    expect(h.mails).toHaveLength(0);
    expect(h.rpcCalls).toContain("waitlist_mail_failed");
    await handleSignup(signupRequest(valid()), h.deps);
    await h.flush();
    expect(h.mails).toHaveLength(1);
  });
});

describe("counter", () => {
  it("caches for 60 seconds per isolate", async () => {
    const h = harness();
    await handleCount(h.deps);
    await handleCount(h.deps);
    expect(h.rpcCalls.filter((c) => c === "waitlist_confirmed_count")).toHaveLength(1);
    h.setNow(new Date(Date.parse("2026-10-27T12:00:00Z") + (COUNT_CACHE_SECONDS + 1) * 1000));
    await handleCount(h.deps);
    expect(h.rpcCalls.filter((c) => c === "waitlist_confirmed_count")).toHaveLength(2);
  });

  it("stays on but without a number when the database is unreachable", async () => {
    const h = harness();
    h.failNext.supabase = true;
    const response = await handleCount(h.deps);
    expect(await response.json()).toEqual({
      enabled: true,
      confirmed: null,
      seats: FOUNDERS_SEATS,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("Supabase client", () => {
  it("sends secret keys only as apikey, legacy JWTs also as bearer", async () => {
    const h = harness();
    await handleCount(h.deps);
    expect(h.supabaseHeaders[0]).toMatchObject({ apikey: KEY });
    expect(h.supabaseHeaders[0]).not.toHaveProperty("authorization");

    const seen: Record<string, string>[] = [];
    const jwt = "eyJhbGciOiJIUzI1NiJ9.e30.sig";
    const store = supabaseStore(
      { supabaseUrl: SUPABASE_URL, supabaseKey: jwt },
      async (_, init) => {
        seen.push(Object.fromEntries(new Headers(init?.headers).entries()));
        return new Response("3");
      },
    );
    expect(await store.confirmedCount()).toBe(3);
    expect(seen[0]).toMatchObject({ apikey: jwt, authorization: `Bearer ${jwt}` });
  });

  it("rejects unexpected answers", async () => {
    const store = supabaseStore({ supabaseUrl: SUPABASE_URL, supabaseKey: KEY }, async () =>
      Response.json("maybe"),
    );
    await expect(store.confirm("a".repeat(64))).rejects.toThrow("supabase request failed");
  });
});

describe("confirmation e-mail", () => {
  const input = {
    confirmUrl: "https://motivo.example/api/waitlist/confirm?token=abc&lang=de",
    unsubscribeUrl: "https://motivo.example/de/founders-warteliste/abmelden#token=def",
    oneClickUnsubscribeUrl: "https://motivo.example/api/waitlist/unsubscribe?token=def",
    privacyUrl: "https://motivo.example/de/datenschutz",
  };

  it.each([
    ["de", de],
    ["en", en],
  ] as const)(
    "in %s has text and HTML without tracking or external resources",
    (locale, messages) => {
      const email = buildConfirmationEmail({
        ...input,
        locale,
        messages: messages as unknown as Messages,
      });
      expect(email.subject).toBe(messages.WaitlistEmail.subject);
      for (const part of [email.text, email.html]) {
        expect(part).toContain(String(WAITLIST_DB_LIMITS.tokenTtlHours));
        expect(part).toContain("49");
        expect(part).not.toMatch(/\{\w+\}/); // every placeholder filled
      }
      expect(email.text).toContain(input.confirmUrl);
      expect(email.text).toContain(input.unsubscribeUrl);
      expect(email.html).toContain(escapeHtml(input.confirmUrl));
      expect(email.html).not.toMatch(/<img|<script|<link|<style|url\(|@import|<iframe/i);
      // Only our own links.
      for (const [, href] of email.html.matchAll(/href="([^"]+)"/g)) {
        expect(href?.replace(/&amp;/g, "&").startsWith("https://motivo.example/")).toBe(true);
      }
      expect(email.headers["List-Unsubscribe"]).toBe(`<${input.oneClickUnsubscribeUrl}>`);
    },
  );

  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});
