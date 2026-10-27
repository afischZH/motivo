/**
 * Request body of POST /api/waitlist. Server only.
 */
import * as z from "zod";

import { ENABLED_LOCALES } from "@/i18n/locales";

import { TURNSTILE_TOKEN_MAX } from "./turnstile";

// Workers forbid eval; Zod's JIT probe would fail anyway (same as tool-registry).
z.config({ jitless: true });

export const MAX_BODY_BYTES = 4096;

export const signupSchema = z.object({
  // Stored lowercased; the database checks the same.
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  locale: z.enum(ENABLED_LOCALES),
  // The unticked checkbox is never sent as true.
  consent: z.literal(true),
  turnstileToken: z.string().max(TURNSTILE_TOKEN_MAX).optional(),
  // Honeypot: hidden from people, filled in by naive bots.
  website: z.string().max(500).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
