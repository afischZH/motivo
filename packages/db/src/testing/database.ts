/**
 * Test database for migrations and RLS: PGlite (Postgres compiled to WASM,
 * in process, no Docker) with the roles and default privileges a Supabase
 * project has. Supabase grants every new table and function in `public` to
 * `anon`, `authenticated` and `service_role`, and `service_role` bypasses
 * RLS, so migrations must revoke what they do not want exposed. Emulating
 * that here makes the tests fail if a migration forgets to.
 *
 * Test-only; never imported by app code.
 */
import { readdir, readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";

export const MIGRATIONS_DIR = new URL("../../../../supabase/migrations/", import.meta.url);

export type DbRole = "anon" | "authenticated" | "service_role";

/** The test database (re-exported so other packages need no PGlite dependency). */
export type TestDatabase = PGlite;

/** Roles and grants as on a Supabase project (simplified to what RLS tests need). */
const SUPABASE_BOOTSTRAP = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

/** Migration files in apply order (timestamp prefix). */
export async function migrationFiles(): Promise<string[]> {
  const names = await readdir(MIGRATIONS_DIR);
  return names.filter((name) => name.endsWith(".sql")).sort();
}

/** A fresh database with the Supabase roles and every migration applied, as superuser. */
export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_BOOTSTRAP);
  for (const name of await migrationFiles()) {
    const sql = await readFile(new URL(name, MIGRATIONS_DIR), "utf8");
    await db.exec(sql);
  }
  return db;
}

/**
 * Runs `fn` as `role` (like a Data API request with that role's key) and
 * switches back to the superuser afterwards, also when `fn` throws.
 */
export async function asRole<T>(db: PGlite, role: DbRole, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
