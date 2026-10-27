/**
 * Minimal Supabase Data API client for the waitlist RPCs, with `fetch` only
 * (no SDK). Server only. Error bodies are never read or logged: Postgres
 * errors can echo the failing row, including the e-mail address.
 *
 * Keys (Supabase docs "Understanding API keys"): secret keys (`sb_secret_…`)
 * go in the `apikey` header only, they are not JWTs. The legacy service_role
 * JWT goes in `apikey` and `Authorization: Bearer`.
 */
import {
  WAITLIST_RPC,
  type WaitlistConfirmOutcome,
  type WaitlistSignupArgs,
  type WaitlistSignupOutcome,
  type WaitlistUnsubscribeOutcome,
} from "@motivo/db";

import type { WaitlistConfig } from "./config";

export type Fetch = typeof fetch;

/** A backend call failed; carries only what is safe to log. */
export class WaitlistBackendError extends Error {
  constructor(
    readonly service: "supabase" | "resend" | "turnstile",
    readonly status: number | null,
  ) {
    super(`${service} request failed${status === null ? "" : ` (HTTP ${status})`}`);
    this.name = "WaitlistBackendError";
  }
}

const TIMEOUT_MS = 8_000;

function headers(key: string): Record<string, string> {
  return {
    apikey: key,
    ...(key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function rpc<T>(
  config: Pick<WaitlistConfig, "supabaseUrl" | "supabaseKey">,
  fetchImpl: Fetch,
  name: string,
  args: object,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers(config.supabaseKey),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new WaitlistBackendError("supabase", null);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new WaitlistBackendError("supabase", response.status);
  }
  if (response.status === 204) return null as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new WaitlistBackendError("supabase", response.status);
  }
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value))
    return value as T;
  throw new WaitlistBackendError("supabase", null);
}

export interface WaitlistStore {
  requestSignup(args: WaitlistSignupArgs): Promise<WaitlistSignupOutcome>;
  mailFailed(confirmTokenHash: string): Promise<void>;
  confirm(tokenHash: string): Promise<WaitlistConfirmOutcome>;
  unsubscribe(tokenHash: string): Promise<WaitlistUnsubscribeOutcome>;
  confirmedCount(): Promise<number>;
}

export function supabaseStore(
  config: Pick<WaitlistConfig, "supabaseUrl" | "supabaseKey">,
  fetchImpl: Fetch = fetch,
): WaitlistStore {
  return {
    async requestSignup(args) {
      const result = await rpc<unknown>(config, fetchImpl, WAITLIST_RPC.requestSignup, args);
      return oneOf(result, ["send", "skip", "rate_limited"] as const);
    },
    async mailFailed(confirmTokenHash) {
      await rpc(config, fetchImpl, WAITLIST_RPC.mailFailed, {
        p_confirm_token_hash: confirmTokenHash,
      });
    },
    async confirm(tokenHash) {
      const result = await rpc<unknown>(config, fetchImpl, WAITLIST_RPC.confirm, {
        p_token_hash: tokenHash,
      });
      return oneOf(result, ["confirmed", "invalid"] as const);
    },
    async unsubscribe(tokenHash) {
      const result = await rpc<unknown>(config, fetchImpl, WAITLIST_RPC.unsubscribe, {
        p_token_hash: tokenHash,
      });
      return oneOf(result, ["unsubscribed", "invalid"] as const);
    },
    async confirmedCount() {
      const result = await rpc<unknown>(config, fetchImpl, WAITLIST_RPC.confirmedCount, {});
      if (typeof result !== "number" || !Number.isInteger(result) || result < 0) {
        throw new WaitlistBackendError("supabase", null);
      }
      return result;
    },
  };
}
