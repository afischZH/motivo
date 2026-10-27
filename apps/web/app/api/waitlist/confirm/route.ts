/** GET /api/waitlist/confirm?token=…&lang=de: one-time confirmation link from the e-mail. */
import { waitlistDeps } from "@/lib/waitlist/deps";
import { handleConfirm } from "@/lib/waitlist/handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleConfirm(request, waitlistDeps());
}

/** Link scanners probing with HEAD must not use up the one-time token. */
export function HEAD(): Response {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
