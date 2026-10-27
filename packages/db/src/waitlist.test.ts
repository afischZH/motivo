/**
 * Founders waitlist migration: RLS, privileges and the SECURITY DEFINER
 * functions, run against PGlite with emulated Supabase roles
 * (`testing/database.ts`).
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MIGRATIONS_DIR, asRole, createTestDatabase, type DbRole } from "./testing/database";
import { WAITLIST_DB_LIMITS, WAITLIST_RPC } from "./waitlist";

const MIGRATION = "20261027120000_founders_waitlist.sql";
const TABLES = ["waitlist_signups", "waitlist_rate_limits"] as const;
const CLIENT_ROLES: DbRole[] = ["anon", "authenticated"];
const ALL_ROLES: DbRole[] = ["anon", "authenticated", "service_role"];

let db: PGlite;
let counter = 0;

/** A fresh 64-char hex value, like the SHA-256 of a random token. */
function hash(label = "token"): string {
  counter += 1;
  return createHash("sha256").update(`${label}-${counter}`).digest("hex");
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  const row = result.rows[0];
  if (!row) throw new Error(`no row: ${sql}`);
  return Object.values(row)[0] as T;
}

interface SignupOptions {
  locale?: string;
  confirm?: string;
  unsubscribe?: string;
  rateKey?: string | null;
}

async function signup(email: string, options: SignupOptions = {}) {
  const confirm = options.confirm ?? hash("confirm");
  const unsubscribe = options.unsubscribe ?? hash("unsubscribe");
  const outcome = await asRole(db, "service_role", () =>
    scalar<string>(`select public.${WAITLIST_RPC.requestSignup}($1, $2, $3, $4, $5, $6)`, [
      email,
      options.locale ?? "de",
      "2026-10-27",
      confirm,
      unsubscribe,
      options.rateKey === undefined ? null : options.rateKey,
    ]),
  );
  return { outcome, confirm, unsubscribe };
}

const confirmToken = (tokenHash: string) =>
  asRole(db, "service_role", () =>
    scalar<string>(`select public.${WAITLIST_RPC.confirm}($1)`, [tokenHash]),
  );
const unsubscribeToken = (tokenHash: string) =>
  asRole(db, "service_role", () =>
    scalar<string>(`select public.${WAITLIST_RPC.unsubscribe}($1)`, [tokenHash]),
  );
const count = (role: DbRole = "anon") =>
  asRole(db, role, () => scalar<number>(`select public.${WAITLIST_RPC.confirmedCount}()`));

async function row(email: string) {
  const result = await db.query<Record<string, unknown>>(
    "select * from public.waitlist_signups where email = $1",
    [email],
  );
  return result.rows[0];
}

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("truncate public.waitlist_signups, public.waitlist_rate_limits");
});

describe("waitlist tables", () => {
  it.each(TABLES)("%s has RLS enabled and no policies", async (table) => {
    expect(
      await scalar<boolean>("select relrowsecurity from pg_class where oid = $1::regclass", [
        `public.${table}`,
      ]),
    ).toBe(true);
    expect(
      await scalar<number>("select count(*)::int from pg_policies where tablename = $1", [table]),
    ).toBe(0);
  });

  it("stores no IP address or other client data", async () => {
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'waitlist_signups' order by ordinal_position`,
    );
    expect(columns.rows.map((c) => c.column_name)).toEqual([
      "id",
      "email",
      "locale",
      "status",
      "consent_version",
      "confirm_token_hash",
      "token_expires_at",
      "unsubscribe_token_hash",
      "send_count",
      "last_sent_at",
      "created_at",
      "confirmed_at",
      "unsubscribed_at",
    ]);
  });

  describe.each(ALL_ROLES)("as %s", (role) => {
    it.each(TABLES)("cannot read or write %s directly", async (table) => {
      await signup("seed@example.com");
      const statements = [
        `select * from public.${table}`,
        `delete from public.${table}`,
        table === "waitlist_signups"
          ? `insert into public.${table} (email, locale, consent_version) values ('x@example.com', 'de', 'v1')`
          : `insert into public.${table} (key_hash, window_start) values ('${hash()}', now())`,
        table === "waitlist_signups"
          ? `update public.${table} set status = 'confirmed'`
          : `update public.${table} set hits = 0`,
      ];
      for (const sql of statements) {
        expect(await asRole(db, role, () => errorCode(db.query(sql))), `${role}: ${sql}`).toBe(
          "42501",
        );
      }
      // Nothing changed.
      expect((await row("seed@example.com"))?.status).toBe("pending");
    });
  });
});

describe("function privileges", () => {
  it.each(CLIENT_ROLES)("%s may only read the confirmed count", async (role) => {
    expect(await count(role)).toBe(0);
    const calls = [
      `select public.${WAITLIST_RPC.requestSignup}('a@example.com', 'de', 'v1', '${hash()}', '${hash()}', null)`,
      `select public.${WAITLIST_RPC.confirm}('${hash()}')`,
      `select public.${WAITLIST_RPC.unsubscribe}('${hash()}')`,
      `select public.${WAITLIST_RPC.mailFailed}('${hash()}')`,
    ];
    for (const sql of calls) {
      expect(await asRole(db, role, () => errorCode(db.query(sql))), sql).toBe("42501");
    }
  });

  it("service_role may call every function", async () => {
    expect(await count("service_role")).toBe(0);
    const { outcome, confirm } = await signup("a@example.com");
    expect(outcome).toBe("send");
    await asRole(db, "service_role", () =>
      db.query(`select public.${WAITLIST_RPC.mailFailed}($1)`, [confirm]),
    );
    expect(await confirmToken(confirm)).toBe("confirmed");
  });

  it("every function is SECURITY DEFINER with an empty search_path", async () => {
    const result = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
      `select proname, prosecdef, proconfig from pg_proc
       where pronamespace = 'public'::regnamespace and proname like 'waitlist_%' order by proname`,
    );
    expect(result.rows.map((r) => r.proname)).toEqual(Object.values(WAITLIST_RPC).sort());
    for (const fn of result.rows) {
      expect(fn.prosecdef, fn.proname).toBe(true);
      expect(fn.proconfig, fn.proname).toEqual(['search_path=""']);
    }
  });

  it("PUBLIC holds no EXECUTE on the server-only functions", async () => {
    const result = await db.query<{ proname: string; acl: string }>(
      `select proname, proacl::text as acl from pg_proc
       where pronamespace = 'public'::regnamespace and proname like 'waitlist_%'`,
    );
    for (const fn of result.rows) {
      // An ACL entry for PUBLIC starts with "=" (no grantee name).
      expect(fn.acl, fn.proname).not.toMatch(/[{,]=/);
      if (fn.proname !== WAITLIST_RPC.confirmedCount) {
        expect(fn.acl, fn.proname).not.toMatch(/\banon=|\bauthenticated=/);
      }
    }
  });
});

describe("sign-up", () => {
  it("creates a pending row with a lowercased address and a 48 h token", async () => {
    const { outcome, confirm } = await signup("  Ada.Lovelace@Example.COM ");
    expect(outcome).toBe("send");
    const r = await row("ada.lovelace@example.com");
    expect(r).toMatchObject({
      status: "pending",
      locale: "de",
      consent_version: "2026-10-27",
      confirm_token_hash: confirm,
      send_count: 1,
      confirmed_at: null,
    });
    const hours =
      ((r?.token_expires_at as Date).getTime() - (r?.created_at as Date).getTime()) / 3_600_000;
    expect(hours).toBeCloseTo(WAITLIST_DB_LIMITS.tokenTtlHours, 1);
  });

  it("is idempotent: a repeat within the cooldown sends nothing", async () => {
    const first = await signup("a@example.com");
    const again = await signup("A@EXAMPLE.com");
    expect(first.outcome).toBe("send");
    expect(again.outcome).toBe("skip");
    expect(await scalar<number>("select count(*)::int from public.waitlist_signups")).toBe(1);
    // The first link still works.
    expect(await confirmToken(first.confirm)).toBe("confirmed");
  });

  it("resends after the cooldown with a fresh token and invalidates the old one", async () => {
    const first = await signup("a@example.com");
    await db.query(
      "update public.waitlist_signups set last_sent_at = now() - interval '11 minutes'",
    );
    const second = await signup("a@example.com", { locale: "en" });
    expect(second.outcome).toBe("send");
    expect((await row("a@example.com"))?.locale).toBe("en");
    expect(await confirmToken(first.confirm)).toBe("invalid");
    expect(await confirmToken(second.confirm)).toBe("confirmed");
  });

  it("caps the mails per address", async () => {
    for (let i = 0; i < WAITLIST_DB_LIMITS.maxSendsPerAddress; i++) {
      expect((await signup("a@example.com")).outcome).toBe("send");
      await db.query("update public.waitlist_signups set last_sent_at = now() - interval '1 hour'");
    }
    expect((await signup("a@example.com")).outcome).toBe("skip");
  });

  it("never mails a confirmed address again", async () => {
    const { confirm } = await signup("a@example.com");
    await confirmToken(confirm);
    await db.query("update public.waitlist_signups set last_sent_at = now() - interval '1 day'");
    expect((await signup("a@example.com")).outcome).toBe("skip");
    expect((await row("a@example.com"))?.status).toBe("confirmed");
  });

  it("deletes unconfirmed sign-ups 30 days after the last mail", async () => {
    await signup("old@example.com");
    await db.query(
      "update public.waitlist_signups set last_sent_at = now() - interval '31 days', created_at = now() - interval '31 days'",
    );
    await signup("new@example.com");
    expect(await row("old@example.com")).toBeUndefined();
    expect(await row("new@example.com")).toBeDefined();
  });

  it("rejects malformed input", async () => {
    expect(await errorCode(signup("a@example.com", { confirm: "nothex" }))).toBe("22023");
    expect(await errorCode(signup("a@example.com", { unsubscribe: "A".repeat(64) }))).toBe("22023");
    expect(await errorCode(signup("not-an-email"))).toBe("23514");
    expect(await errorCode(signup("a@example.com", { locale: "xx" }))).toBe("23514");
    expect(await errorCode(signup("a@example.com", { rateKey: "0".repeat(64) }))).toBe("22023");
    expect(await errorCode(signup("a@example.com", { rateKey: "zz" }))).toBe("23514");
  });
});

describe("rate limits", () => {
  it("limits requests per hashed IP and hour", async () => {
    const ip = hash("ip");
    for (let i = 0; i < WAITLIST_DB_LIMITS.ipRequestsPerHour; i++) {
      expect((await signup(`u${i}@example.com`, { rateKey: ip })).outcome).toBe("send");
    }
    expect((await signup("late@example.com", { rateKey: ip })).outcome).toBe("rate_limited");
    expect(await row("late@example.com")).toBeUndefined();
    // Other clients and requests without a key are not affected.
    expect((await signup("other@example.com", { rateKey: hash("ip") })).outcome).toBe("send");
    expect((await signup("nokey@example.com")).outcome).toBe("send");
  });

  it("caps confirmation mails per day for everybody, with the same answer for every address", async () => {
    const { confirm } = await signup("known@example.com");
    await confirmToken(confirm);
    await db.query(
      "update public.waitlist_rate_limits set hits = $1 where key_hash = repeat('0', 64)",
      [WAITLIST_DB_LIMITS.globalSendsPerDay],
    );
    expect((await signup("new@example.com")).outcome).toBe("rate_limited");
    expect((await signup("known@example.com")).outcome).toBe("rate_limited");
  });

  it("counts only sent mails against the daily budget", async () => {
    await signup("a@example.com");
    await signup("a@example.com"); // skip
    expect(
      await scalar<number>(
        "select hits from public.waitlist_rate_limits where key_hash = repeat('0', 64)",
      ),
    ).toBe(1);
  });

  it("deletes counters older than a day", async () => {
    await db.query(
      "insert into public.waitlist_rate_limits (key_hash, window_start, hits) values ($1, now() - interval '2 days', 3)",
      [hash("ip")],
    );
    await signup("a@example.com");
    expect(
      await scalar<number>(
        "select count(*)::int from public.waitlist_rate_limits where window_start < now() - interval '1 day'",
      ),
    ).toBe(0);
  });
});

describe("failed mail", () => {
  it("lifts the cooldown and returns the mail to the daily budget", async () => {
    const { confirm } = await signup("a@example.com");
    await asRole(db, "service_role", () =>
      db.query(`select public.${WAITLIST_RPC.mailFailed}($1)`, [confirm]),
    );
    expect(
      await scalar<number>(
        "select hits from public.waitlist_rate_limits where key_hash = repeat('0', 64)",
      ),
    ).toBe(0);
    expect((await signup("a@example.com")).outcome).toBe("send");
  });
});

describe("confirmation", () => {
  it("confirms once and counts confirmed sign-ups only", async () => {
    const a = await signup("a@example.com");
    await signup("b@example.com");
    expect(await count()).toBe(0);
    expect(await confirmToken(a.confirm)).toBe("confirmed");
    expect(await count()).toBe(1);
    expect(await count("authenticated")).toBe(1);
    // One-time: the hash is cleared.
    expect(await confirmToken(a.confirm)).toBe("invalid");
    expect(await row("a@example.com")).toMatchObject({
      status: "confirmed",
      confirm_token_hash: null,
      token_expires_at: null,
    });
    expect((await row("a@example.com"))?.confirmed_at).toBeInstanceOf(Date);
  });

  it("rejects expired and unknown tokens", async () => {
    const { confirm } = await signup("a@example.com");
    await db.query(
      "update public.waitlist_signups set token_expires_at = now() - interval '1 second'",
    );
    expect(await confirmToken(confirm)).toBe("invalid");
    expect(await confirmToken(hash())).toBe("invalid");
    expect(await count()).toBe(0);
  });
});

describe("unsubscribe", () => {
  it("erases the address and every token, once", async () => {
    const { confirm, unsubscribe } = await signup("a@example.com");
    await confirmToken(confirm);
    expect(await count()).toBe(1);
    expect(await unsubscribeToken(unsubscribe)).toBe("unsubscribed");
    expect(await unsubscribeToken(unsubscribe)).toBe("invalid");
    expect(await count()).toBe(0);
    const rows = await db.query<Record<string, unknown>>("select * from public.waitlist_signups");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      status: "unsubscribed",
      email: null,
      confirm_token_hash: null,
      unsubscribe_token_hash: null,
    });
  });

  it("works before confirming and allows a new sign-up later", async () => {
    const first = await signup("a@example.com");
    expect(await unsubscribeToken(first.unsubscribe)).toBe("unsubscribed");
    expect(await confirmToken(first.confirm)).toBe("invalid");
    expect((await signup("a@example.com")).outcome).toBe("send");
  });
});

describe("limits in the migration", () => {
  it("match WAITLIST_DB_LIMITS", async () => {
    const sql = await readFile(new URL(MIGRATION, MIGRATIONS_DIR), "utf8");
    const constant = (name: string) =>
      sql.match(new RegExp(`${name} constant [^:]+:= ([^;]+);`))?.[1];
    expect(constant("c_ip_limit_per_hour")).toBe(String(WAITLIST_DB_LIMITS.ipRequestsPerHour));
    expect(constant("c_max_sends")).toBe(String(WAITLIST_DB_LIMITS.maxSendsPerAddress));
    expect(constant("c_global_sends_per_day")).toBe(String(WAITLIST_DB_LIMITS.globalSendsPerDay));
    expect(constant("c_resend_cooldown")).toBe(
      `interval '${WAITLIST_DB_LIMITS.resendCooldownMinutes} minutes'`,
    );
    expect(constant("c_token_ttl")).toBe(`interval '${WAITLIST_DB_LIMITS.tokenTtlHours} hours'`);
    expect(constant("c_pending_retention")).toBe(
      `interval '${WAITLIST_DB_LIMITS.pendingRetentionDays} days'`,
    );
  });
});
